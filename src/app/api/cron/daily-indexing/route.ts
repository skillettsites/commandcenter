import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram, escapeHtml, formatLondonDate, isCronAuthorized } from '@/lib/telegram';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const INDEXNOW_KEY_PRIMARY = 'b2848c88a7d245ba80bbeb6348b4aae5';
const INDEXNOW_KEY_FALLBACK = '9f8bffeec3da46879377492cf2645cc9';
const FRESH_DAYS = 7;
const BING_CAP_PER_SITE = 100;

const CCC_PRIORITY_PATHS = new Set([
  '/car-check-faq', '/hpi-check-faq', '/cat-n-cat-s-faq', '/finance-check-faq',
  '/blog/cat-s-vs-cat-n-buyers-guide', '/blog/free-outstanding-finance-check-truth',
  '/blog/cheapest-cat-n-check-uk', '/blog/can-you-finance-a-cat-n-car',
  '/blog/carvertical-vs-carcostcheck', '/blog/v5c-logbook-fake-check-guide',
  '/blog/car-cloning-check-uk', '/blog/buying-used-car-checklist-2026',
  '/compare-hpi', '/free-car-check', '/car-history-check', '/mot-history-check',
  '/finance-check', '/write-off-check', '/stolen-car-check', '/vin-check',
  '/car-valuation', '/recalls-check', '/insurance-group-check',
  '/fuel-cost-calculator', '/depreciation-calculator', '/road-tax-calculator',
  '/car-tax-check', '/mileage-check',
]);

const APPEALAFINE_PRIORITY_PATHS = new Set([
  '/blog/popla-appeal-rejected-what-next', '/blog/dcbl-letter-parking-fine-legal',
  '/blog/bw-legal-court-claim-defence', '/blog/letter-before-claim-parking-fine-reply',
  '/blog/debt-recovery-plus-drp-parking-fine', '/blog/mcol-parking-fine-defence-online',
  '/blog/parkingeye-signage-popla-wins-2025', '/blog/ukpc-anpr-pofa-schedule-4-defence',
  '/blog/ias-appeal-rejected-next-steps', '/blog/ulez-pcn-appeal-grounds-2026',
  '/blog/n244-form-set-aside-parking-ccj', '/blog/parking-fine-affect-credit-score',
  '/blog/single-code-of-practice-2026-rules', '/blog/excel-parking-pcn-weaknesses',
  '/blog/smart-parking-anpr-errors-ias', '/blog/statutory-demand-parking-fine',
  '/blog/traffic-penalty-tribunal-appeal-win', '/blog/parkingeye-ccj-credit-file-remove',
  '/blog/bus-lane-fine-emergency-vehicle', '/blog/parking-fine-car-at-garage-mot-repair',
  '/pricing', '/appeal',
]);

// Sitemap URLs per project (keep close to projects.ts; falls back to canonical)
function siteMapForProject(p: typeof projects[number]): string {
  const base = p.url?.replace(/\/$/, '');
  if (!base) return '';
  return `${base}/sitemap.xml`;
}

let _gscAuth: GoogleAuth | null = null;
function getGscAuth(): GoogleAuth | null {
  if (_gscAuth) return _gscAuth;
  const email = process.env.GA_CLIENT_EMAIL;
  const key = process.env.GA_PRIVATE_KEY;
  if (!email || !key) return null;
  _gscAuth = new GoogleAuth({
    credentials: { client_email: email, private_key: key.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  return _gscAuth;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function dateString(daysOffset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

interface SitemapEntry { url: string; lastmod?: string; }

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (CommandCenter daily-indexing cron)' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

function parseSitemap(xml: string): { entries: SitemapEntry[]; isIndex: boolean } {
  const isIndex = /<sitemapindex/i.test(xml);
  const entries: SitemapEntry[] = [];
  const blockRe = /<(url|sitemap)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[2];
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1];
    if (loc) entries.push({ url: loc, lastmod });
  }
  return { entries, isIndex };
}

async function fetchAllSitemapEntries(sitemapUrl: string): Promise<SitemapEntry[]> {
  const xml = await fetchText(sitemapUrl);
  if (!xml) return [];
  const { entries, isIndex } = parseSitemap(xml);
  if (!isIndex) return entries;
  const childResults = await Promise.all(
    entries.map((e) => fetchText(e.url).then(parseSitemap).then((p) => p.entries).catch(() => []))
  );
  return childResults.flat();
}

function isFresh(lastmod: string | undefined, days = FRESH_DAYS): boolean {
  if (!lastmod) return false;
  const t = Date.parse(lastmod);
  if (isNaN(t)) return false;
  return Date.now() - t < days * 86400000;
}

function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p.replace(/\/$/, '') || '/';
  } catch {
    return '';
  }
}

function prioritise(
  entries: SitemapEntry[],
  siteId: string,
  recentlyDiscovered: Set<string>,
  firstSeenMap: Map<string, string>
): SitemapEntry[] {
  const pinned: SitemapEntry[] = [];
  const newly: SitemapEntry[] = [];
  const fresh: SitemapEntry[] = [];
  const home: SitemapEntry[] = [];
  const articles: SitemapEntry[] = [];
  const rest: SitemapEntry[] = [];

  for (const e of entries) {
    const path = pathOf(e.url);
    if (siteId === 'carcostcheck' && CCC_PRIORITY_PATHS.has(path)) {
      pinned.push(e);
    } else if (siteId === 'appealafine' && APPEALAFINE_PRIORITY_PATHS.has(path)) {
      pinned.push(e);
    } else if (recentlyDiscovered.has(e.url)) {
      newly.push(e);
    } else if (isFresh(e.lastmod)) {
      fresh.push(e);
    } else if (path === '/' || path === '') {
      home.push(e);
    } else if (path.startsWith('/blog') || path.startsWith('/article') || path.startsWith('/guide')) {
      articles.push(e);
    } else {
      rest.push(e);
    }
  }

  // Newly discovered: sort by first_seen_at desc so the most-recently-created page
  // is always at the head of the queue.
  newly.sort((a, b) => {
    const aSeen = firstSeenMap.get(a.url) || '1970';
    const bSeen = firstSeenMap.get(b.url) || '1970';
    return Date.parse(bSeen) - Date.parse(aSeen);
  });

  const byNewest = (a: SitemapEntry, b: SitemapEntry) =>
    Date.parse(b.lastmod || '1970') - Date.parse(a.lastmod || '1970');
  fresh.sort(byNewest);
  articles.sort(byNewest);
  rest.sort(byNewest);

  return [...pinned, ...newly, ...fresh, ...home, ...articles, ...rest];
}

const DISCOVERY_WINDOW_HOURS = 48;
const SITEMAP_UPSERT_CHUNK = 1000;

async function trackSitemapDiscovery(
  sb: NonNullable<ReturnType<typeof getSupabase>>,
  siteId: string,
  entries: SitemapEntry[]
): Promise<{ recentlyDiscovered: Set<string>; firstSeenMap: Map<string, string>; error?: string }> {
  const recentlyDiscovered = new Set<string>();
  const firstSeenMap = new Map<string, string>();
  if (entries.length === 0) return { recentlyDiscovered, firstSeenMap };

  // Insert every sitemap URL with ON CONFLICT DO NOTHING — first sighting
  // captures first_seen_at = now(), repeat sightings preserve original.
  const now = new Date().toISOString();
  for (let i = 0; i < entries.length; i += SITEMAP_UPSERT_CHUNK) {
    const rows = entries.slice(i, i + SITEMAP_UPSERT_CHUNK).map((e) => ({
      site_id: siteId,
      url: e.url,
      first_seen_at: now,
    }));
    const { error } = await sb
      .from('sitemap_urls')
      .upsert(rows, { onConflict: 'site_id,url', ignoreDuplicates: true });
    if (error) {
      return { recentlyDiscovered, firstSeenMap, error: error.message.slice(0, 120) };
    }
  }

  const cutoff = new Date(Date.now() - DISCOVERY_WINDOW_HOURS * 3600_000).toISOString();
  const { data, error } = await sb
    .from('sitemap_urls')
    .select('url, first_seen_at')
    .eq('site_id', siteId)
    .gte('first_seen_at', cutoff)
    .limit(50000);
  if (error) {
    return { recentlyDiscovered, firstSeenMap, error: error.message.slice(0, 120) };
  }
  for (const row of (data || []) as Array<{ url: string; first_seen_at: string }>) {
    recentlyDiscovered.add(row.url);
    firstSeenMap.set(row.url, row.first_seen_at);
  }
  return { recentlyDiscovered, firstSeenMap };
}

async function getBingQuota(siteUrl: string, apiKey: string): Promise<{ daily: number; monthly: number } | null> {
  try {
    const r = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota?apikey=${apiKey}&siteUrl=${encodeURIComponent(siteUrl)}`,
      { cache: 'no-store' }
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.d?.DailyQuota !== undefined) return { daily: j.d.DailyQuota, monthly: j.d.MonthlyQuota };
  } catch {}
  return null;
}

async function submitBingBatch(
  siteUrl: string,
  urls: string[],
  apiKey: string
): Promise<{ ok: boolean; submitted: number; error?: string }> {
  if (urls.length === 0) return { ok: true, submitted: 0 };
  try {
    const r = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl, urlList: urls }),
    });
    if (!r.ok) return { ok: false, submitted: 0, error: `HTTP ${r.status}` };
    const j = await r.json();
    if (j?.ErrorCode) return { ok: false, submitted: 0, error: `${j.ErrorCode}: ${j.Message || ''}` };
    return { ok: true, submitted: urls.length };
  } catch (err) {
    return { ok: false, submitted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function pingIndexNow(host: string, urls: string[]): Promise<{ ok: boolean; status: number; usedKey: string }> {
  if (urls.length === 0 || !host) return { ok: false, status: 0, usedKey: 'none' };
  const post = async (k: string) => {
    const r = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key: k,
        keyLocation: `https://${host}/${k}.txt`,
        urlList: urls.slice(0, 10000),
      }),
    });
    return r.status;
  };
  let status = await post(INDEXNOW_KEY_PRIMARY);
  let usedKey = 'primary';
  if (status === 403) {
    status = await post(INDEXNOW_KEY_FALLBACK);
    usedKey = 'fallback';
  }
  return { ok: status === 200 || status === 202, status, usedKey };
}

async function fetchGscWindow(token: string, siteUrl: string, start: string, end: string) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: [] }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GSC ${res.status}`);
  const data = await res.json();
  const row = data.rows?.[0];
  return { clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0 };
}

async function fetchBingIndexedPages(siteUrl: string, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://ssl.bing.com/webmaster/api.svc/json/GetPageStats?siteUrl=${encodeURIComponent(siteUrl)}&apikey=${apiKey}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.d ?? data ?? [];
    if (Array.isArray(rows)) {
      const unique = new Set<string>();
      for (const r of rows) {
        const url = r.Query ?? r.Url ?? r.Page;
        if (url) unique.add(url);
      }
      return unique.size;
    }
    return null;
  } catch {
    return null;
  }
}

interface SiteResult {
  id: string;
  label: string;
  // GSC
  gscClicks: number | null;
  gscImpressions: number | null;
  gscClicksPrev: number | null;
  // Bing index status
  bingPages: number | null;
  // Submission this run
  sitemapTotal: number;
  newCount: number;
  freshCount: number;
  newlyDiscoveredCount: number;
  bingSubmitted: number;
  bingQuotaRemaining: number | null;
  bingError?: string;
  indexNowStatus: number | null;
  indexNowOk: boolean;
  errors: string[];
}

async function processSite(
  p: typeof projects[number],
  opts: { token?: string; bingKey?: string; supabase: ReturnType<typeof getSupabase>; doSubmit: boolean }
): Promise<SiteResult> {
  const result: SiteResult = {
    id: p.id,
    label: p.name,
    gscClicks: null,
    gscImpressions: null,
    gscClicksPrev: null,
    bingPages: null,
    sitemapTotal: 0,
    newCount: 0,
    freshCount: 0,
    newlyDiscoveredCount: 0,
    bingSubmitted: 0,
    bingQuotaRemaining: null,
    indexNowStatus: null,
    indexNowOk: false,
    errors: [],
  };

  // GSC reads (parallel with sitemap fetch)
  const yesterday = dateString(-3);
  const dayBefore = dateString(-4);
  const gscPromise = (async () => {
    if (!opts.token || !p.gscSiteUrl) return;
    try {
      const [curr, prev] = await Promise.all([
        fetchGscWindow(opts.token, p.gscSiteUrl, yesterday, yesterday),
        fetchGscWindow(opts.token, p.gscSiteUrl, dayBefore, dayBefore),
      ]);
      result.gscClicks = curr.clicks;
      result.gscImpressions = curr.impressions;
      result.gscClicksPrev = prev.clicks;
    } catch (err) {
      result.errors.push(`gsc: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  // Bing index pages (parallel)
  const bingIndexPromise = (async () => {
    if (opts.bingKey && p.bingSiteUrl) {
      result.bingPages = await fetchBingIndexedPages(p.bingSiteUrl, opts.bingKey);
    }
  })();

  // Sitemap + submission (parallel with above)
  const submissionPromise = (async () => {
    const sitemapUrl = siteMapForProject(p);
    if (!sitemapUrl) return;
    const entries = await fetchAllSitemapEntries(sitemapUrl);
    result.sitemapTotal = entries.length;
    if (entries.length === 0) {
      result.errors.push('sitemap empty or unreachable');
      return;
    }
    result.freshCount = entries.filter((e) => isFresh(e.lastmod)).length;

    // Load already-submitted from Supabase
    let submittedSet = new Set<string>();
    if (opts.supabase) {
      try {
        const { data, error } = await opts.supabase
          .from('bing_submissions')
          .select('url')
          .eq('site_id', p.id);
        if (error) {
          result.errors.push(`supabase read: ${error.message.slice(0, 80)}`);
        } else if (data) {
          submittedSet = new Set(data.map((r: { url: string }) => r.url));
        }
      } catch (err) {
        result.errors.push(`supabase: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const newEntries = entries.filter((e) => !submittedSet.has(e.url));
    result.newCount = newEntries.length;

    // Track sitemap discovery so newly-created pages bubble to the top
    // even on sites whose sitemap doesn't emit per-page lastmod (CCC etc).
    let recentlyDiscovered = new Set<string>();
    let firstSeenMap = new Map<string, string>();
    if (opts.supabase) {
      const disc = await trackSitemapDiscovery(opts.supabase, p.id, entries);
      recentlyDiscovered = disc.recentlyDiscovered;
      firstSeenMap = disc.firstSeenMap;
      if (disc.error) result.errors.push(`discovery: ${disc.error}`);
    }
    result.newlyDiscoveredCount = newEntries.filter((e) => recentlyDiscovered.has(e.url)).length;

    // IndexNow first — pings ALL sitemap URLs (cheap, deduped server-side)
    const allUrls = entries.map((e) => e.url);
    const host = (() => {
      try { return new URL(allUrls[0]).host; } catch { return ''; }
    })();
    if (opts.doSubmit && host) {
      const inow = await pingIndexNow(host, allUrls);
      result.indexNowStatus = inow.status;
      result.indexNowOk = inow.ok;
    }

    // Bing batch submit — capped to BING_CAP_PER_SITE and live quota
    if (opts.doSubmit && opts.bingKey && p.bingSiteUrl && newEntries.length > 0) {
      const quota = await getBingQuota(p.bingSiteUrl, opts.bingKey);
      const dailyLeft = quota?.daily ?? 0;
      result.bingQuotaRemaining = dailyLeft;
      if (dailyLeft <= 0) {
        result.bingError = 'quota exhausted';
      } else {
        const limit = Math.min(BING_CAP_PER_SITE, dailyLeft, newEntries.length);
        const prioritised = prioritise(newEntries, p.id, recentlyDiscovered, firstSeenMap).slice(0, limit);
        const out = await submitBingBatch(
          p.bingSiteUrl,
          prioritised.map((e) => e.url),
          opts.bingKey
        );
        if (out.ok) {
          result.bingSubmitted = out.submitted;
          if (opts.supabase && out.submitted > 0) {
            const rows = prioritised.slice(0, out.submitted).map((e) => ({ site_id: p.id, url: e.url }));
            const { error } = await opts.supabase
              .from('bing_submissions')
              .upsert(rows, { onConflict: 'site_id,url', ignoreDuplicates: true });
            if (error) result.errors.push(`supabase write: ${error.message.slice(0, 80)}`);
          }
        } else {
          result.bingError = out.error;
        }
      }
    }
  })();

  await Promise.all([gscPromise, bingIndexPromise, submissionPromise]);
  return result;
}

function trend(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return '';
  const diff = curr - prev;
  if (diff === 0) return '';
  const arrow = diff > 0 ? '▲' : '▼';
  const pct = prev > 0 ? ` (${diff > 0 ? '+' : ''}${((diff / prev) * 100).toFixed(0)}%)` : '';
  return ` ${arrow} ${diff > 0 ? '+' : ''}${diff}${pct}`;
}

function buildMessage(rows: SiteResult[], doSubmit: boolean): string {
  const dateLabel = formatLondonDate();
  const totalClicks = rows.reduce((s, r) => s + (r.gscClicks ?? 0), 0);
  const totalClicksPrev = rows.reduce((s, r) => s + (r.gscClicksPrev ?? 0), 0);
  const totalImpr = rows.reduce((s, r) => s + (r.gscImpressions ?? 0), 0);
  const totalBing = rows.reduce((s, r) => s + (r.bingPages ?? 0), 0);
  const totalSubmitted = rows.reduce((s, r) => s + r.bingSubmitted, 0);
  const totalFresh = rows.reduce((s, r) => s + r.freshCount, 0);
  const totalNew = rows.reduce((s, r) => s + r.newCount, 0);
  const totalNewlyDiscovered = rows.reduce((s, r) => s + r.newlyDiscoveredCount, 0);

  const parts: string[] = [];
  parts.push(`<b>🔍 Indexing health · ${escapeHtml(dateLabel)}</b>`);
  parts.push(`<i>GSC: latest complete day vs day before · Bing: pages indexed · submission stats below</i>`);
  parts.push('');
  parts.push('<b>Totals</b>');
  parts.push(`• GSC clicks: <b>${totalClicks}</b>${escapeHtml(trend(totalClicks, totalClicksPrev))}`);
  parts.push(`• GSC impressions: <b>${totalImpr.toLocaleString('en-GB')}</b>`);
  parts.push(`• Bing indexed: <b>${totalBing.toLocaleString('en-GB')}</b>`);
  if (doSubmit) {
    parts.push(
      `• Submitted to Bing today: <b>${totalSubmitted}</b> (of ${totalNew} new · 🆕 ${totalNewlyDiscovered} pages added in last 48h)`
    );
  }
  parts.push('');

  const movers = [...rows]
    .filter((r) => (r.gscClicks ?? 0) > 0 || (r.gscClicksPrev ?? 0) > 0)
    .sort((a, b) => ((b.gscClicks ?? 0) - (b.gscClicksPrev ?? 0)) - ((a.gscClicks ?? 0) - (a.gscClicksPrev ?? 0)));
  if (movers.length > 0) {
    parts.push('<b>Top movers (clicks)</b>');
    movers.slice(0, 5).forEach((r) => {
      parts.push(`• ${escapeHtml(r.label)}: ${r.gscClicks ?? 0}${escapeHtml(trend(r.gscClicks, r.gscClicksPrev))}`);
    });
    parts.push('');
  }

  if (doSubmit) {
    const submitters = [...rows].filter(
      (r) => r.bingSubmitted > 0 || r.newlyDiscoveredCount > 0 || r.freshCount > 0 || r.bingError
    );
    if (submitters.length > 0) {
      parts.push('<b>Submissions</b>');
      submitters
        .sort((a, b) => b.newlyDiscoveredCount - a.newlyDiscoveredCount || b.bingSubmitted - a.bingSubmitted)
        .slice(0, 12)
        .forEach((r) => {
          const submitPart = r.bingError
            ? `❌ Bing: ${r.bingError}`
            : `Bing ${r.bingSubmitted}${r.bingQuotaRemaining !== null ? `/${r.bingQuotaRemaining}` : ''}`;
          const newPart = r.newlyDiscoveredCount > 0 ? ` · 🆕 ${r.newlyDiscoveredCount}` : '';
          const inowPart = r.indexNowOk ? `IndexNow ✓` : r.indexNowStatus !== null ? `IndexNow ${r.indexNowStatus}` : '';
          parts.push(
            `• ${escapeHtml(r.label)}: ${escapeHtml(submitPart)}${escapeHtml(newPart)} · ${escapeHtml(inowPart)}`
          );
        });
      parts.push('');
    }
  }

  parts.push('<b>Per site (GSC / Bing index)</b>');
  for (const r of [...rows].sort((a, b) => (b.gscClicks ?? 0) - (a.gscClicks ?? 0))) {
    const click = r.gscClicks === null ? '—' : String(r.gscClicks);
    const imp = r.gscImpressions === null ? '—' : r.gscImpressions.toLocaleString('en-GB');
    const bing = r.bingPages === null ? '—' : r.bingPages.toLocaleString('en-GB');
    parts.push(
      `• <b>${escapeHtml(r.label)}</b> · GSC ${click}/${imp}${escapeHtml(trend(r.gscClicks, r.gscClicksPrev))} · Bing ${bing}`
    );
  }

  const failed = rows.filter((r) => r.errors.length > 0);
  if (failed.length > 0) {
    parts.push('');
    parts.push(`⚠️ <b>${failed.length} site${failed.length > 1 ? 's' : ''} had errors</b>`);
    failed.slice(0, 6).forEach((r) => {
      parts.push(`• ${escapeHtml(r.label)}: ${escapeHtml(r.errors.slice(0, 2).join('; '))}`);
    });
  } else {
    parts.push('');
    parts.push('✅ All sites checked' + (doSubmit ? ' and submitted' : ''));
  }
  return parts.join('\n');
}

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const doSubmit = url.searchParams.get('submit') !== '0';
  const siteFilter = url.searchParams.get('site');

  const auth = getGscAuth();
  let token: string | undefined;
  if (auth) {
    try {
      const client = await auth.getClient();
      const t = await client.getAccessToken();
      token = t.token || undefined;
    } catch (err) {
      console.error('GSC auth failed', err);
    }
  }
  const bingKey = process.env.BING_WEBMASTER_API_KEY;
  const supabase = getSupabase();

  const trackable = projects.filter(
    (p) => (p.gscSiteUrl || p.bingSiteUrl) && p.url && p.id !== 'dashboard' && p.id !== 'personal' && p.id !== 'general'
  );
  const filtered = siteFilter ? trackable.filter((p) => p.id === siteFilter) : trackable;

  const rows = await Promise.all(
    filtered.map((p) => processSite(p, { token, bingKey, supabase, doSubmit }))
  );

  const message = buildMessage(rows, doSubmit);

  if (dryRun) {
    return NextResponse.json({ message, rows }, { status: 200 });
  }

  const tg = await sendTelegram(message);
  return NextResponse.json(
    {
      ok: tg.ok,
      sent: tg.sent,
      telegramError: tg.error,
      siteCount: rows.length,
      submittedCount: rows.reduce((s, r) => s + r.bingSubmitted, 0),
    },
    { status: tg.ok ? 200 : 500 }
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
