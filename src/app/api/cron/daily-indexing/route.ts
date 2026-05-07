import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { sendTelegram, escapeHtml, formatLondonDate, isCronAuthorized } from '@/lib/telegram';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let _auth: GoogleAuth | null = null;
function getGscAuth(): GoogleAuth | null {
  if (_auth) return _auth;
  const email = process.env.GA_CLIENT_EMAIL;
  const key = process.env.GA_PRIVATE_KEY;
  if (!email || !key) return null;
  _auth = new GoogleAuth({
    credentials: { client_email: email, private_key: key.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  return _auth;
}

function dateString(daysOffset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

interface SiteRow {
  id: string;
  label: string;
  gscClicks: number | null;
  gscImpressions: number | null;
  gscClicksPrev: number | null;
  bingPages: number | null;
  errors: string[];
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
  // GetUrlInfo on the root returns InIndex stats; safer approach is page stats count
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

function trend(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return '';
  const diff = curr - prev;
  if (diff === 0) return '';
  const arrow = diff > 0 ? '▲' : '▼';
  const pct = prev > 0 ? ` (${diff > 0 ? '+' : ''}${((diff / prev) * 100).toFixed(1)}%)` : '';
  return ` ${arrow} ${diff > 0 ? '+' : ''}${diff}${pct}`;
}

function buildMessage(rows: SiteRow[]): string {
  const dateLabel = formatLondonDate();
  const totalClicks = rows.reduce((s, r) => s + (r.gscClicks ?? 0), 0);
  const totalClicksPrev = rows.reduce((s, r) => s + (r.gscClicksPrev ?? 0), 0);
  const totalImpr = rows.reduce((s, r) => s + (r.gscImpressions ?? 0), 0);
  const totalBing = rows.reduce((s, r) => s + (r.bingPages ?? 0), 0);
  const failed = rows.filter((r) => r.errors.length > 0);

  const parts: string[] = [];
  parts.push(`<b>🔍 Indexing health · ${escapeHtml(dateLabel)}</b>`);
  parts.push(`<i>GSC: latest complete day vs day before (3-day lag) · Bing: pages currently indexed</i>`);
  parts.push('');
  parts.push(`<b>Totals</b>`);
  parts.push(`• GSC clicks: <b>${totalClicks}</b>${escapeHtml(trend(totalClicks, totalClicksPrev))}`);
  parts.push(`• GSC impressions: <b>${totalImpr.toLocaleString('en-GB')}</b>`);
  parts.push(`• Bing indexed pages: <b>${totalBing.toLocaleString('en-GB')}</b>`);
  parts.push('');

  const ranked = [...rows]
    .filter((r) => (r.gscClicks ?? 0) > 0 || (r.gscClicksPrev ?? 0) > 0)
    .sort((a, b) => {
      const da = (a.gscClicks ?? 0) - (a.gscClicksPrev ?? 0);
      const db = (b.gscClicks ?? 0) - (b.gscClicksPrev ?? 0);
      return db - da;
    });

  if (ranked.length > 0) {
    parts.push('<b>Top movers (clicks)</b>');
    ranked.slice(0, 6).forEach((r) => {
      parts.push(
        `• ${escapeHtml(r.label)}: ${r.gscClicks ?? 0}${escapeHtml(trend(r.gscClicks, r.gscClicksPrev))}`
      );
    });
    if (ranked.length > 6) {
      const tail = ranked.slice(-3).reverse();
      parts.push('');
      parts.push('<b>Bottom movers</b>');
      tail.forEach((r) => {
        parts.push(
          `• ${escapeHtml(r.label)}: ${r.gscClicks ?? 0}${escapeHtml(trend(r.gscClicks, r.gscClicksPrev))}`
        );
      });
    }
    parts.push('');
  }

  parts.push('<b>Per site</b>');
  for (const r of [...rows].sort((a, b) => (b.gscClicks ?? 0) - (a.gscClicks ?? 0))) {
    const click = r.gscClicks === null ? '—' : String(r.gscClicks);
    const imp = r.gscImpressions === null ? '—' : r.gscImpressions.toLocaleString('en-GB');
    const bing = r.bingPages === null ? '—' : r.bingPages.toLocaleString('en-GB');
    parts.push(
      `• <b>${escapeHtml(r.label)}</b> · GSC ${click}/${imp}${escapeHtml(trend(r.gscClicks, r.gscClicksPrev))} · Bing ${bing}`
    );
  }

  if (failed.length > 0) {
    parts.push('');
    parts.push(`⚠️ <b>${failed.length} site${failed.length > 1 ? 's' : ''} had errors</b>`);
    failed.slice(0, 6).forEach((r) => {
      parts.push(`• ${escapeHtml(r.label)}: ${escapeHtml(r.errors.join('; '))}`);
    });
  } else {
    parts.push('');
    parts.push('✅ Indexing checks complete, all sites queried');
  }
  return parts.join('\n');
}

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';

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

  // GSC has a 2-3 day data lag, so we compare day -3 vs day -4 for reliably populated data
  const yesterday = dateString(-3);
  const dayBefore = dateString(-4);

  // Filter to projects with at least one of GSC/Bing wired
  const trackable = projects.filter((p) => p.gscSiteUrl || p.bingSiteUrl);

  const rows: SiteRow[] = await Promise.all(
    trackable.map(async (p) => {
      const errors: string[] = [];
      let gscClicks: number | null = null;
      let gscImpressions: number | null = null;
      let gscClicksPrev: number | null = null;
      let bingPages: number | null = null;

      if (token && p.gscSiteUrl) {
        try {
          const [curr, prev] = await Promise.all([
            fetchGscWindow(token, p.gscSiteUrl, yesterday, yesterday),
            fetchGscWindow(token, p.gscSiteUrl, dayBefore, dayBefore),
          ]);
          gscClicks = curr.clicks;
          gscImpressions = curr.impressions;
          gscClicksPrev = prev.clicks;
        } catch (err) {
          errors.push(`gsc: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (bingKey && p.bingSiteUrl) {
        bingPages = await fetchBingIndexedPages(p.bingSiteUrl, bingKey);
      }

      return {
        id: p.id,
        label: p.name,
        gscClicks,
        gscImpressions,
        gscClicksPrev,
        bingPages,
        errors,
      };
    })
  );

  const message = buildMessage(rows);

  if (dryRun) {
    return NextResponse.json({ message, rows }, { status: 200 });
  }

  const tg = await sendTelegram(message);
  return NextResponse.json(
    { ok: tg.ok, sent: tg.sent, telegramError: tg.error, siteCount: rows.length },
    { status: tg.ok ? 200 : 500 }
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
