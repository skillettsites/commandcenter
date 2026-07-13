import { NextResponse } from 'next/server';
import { sendTelegram, escapeHtml, formatLondonTime, formatLondonDate, isCronAuthorized } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Account {
  id: string;
  label: string;
  envVar: string;
}

const ACCOUNTS: Account[] = [
  { id: 'ccc', label: 'CarCostCheck', envVar: 'STRIPE_KEY_CARCOSTCHECK' },
  { id: 'aaf', label: 'AppealAFine', envVar: 'STRIPE_KEY_APPEALAFINE' },
  { id: 'pcc', label: 'PostcodeCheck', envVar: 'STRIPE_KEY_POSTCODECHECK' },
  { id: 'mms', label: 'MatchMySkillset', envVar: 'STRIPE_KEY_MATCHMYSKILLSET' },
];

interface CheckoutSession {
  id: string;
  created: number;
  payment_status: string;
  status: string;
  amount_total: number | null;
  currency: string | null;
  customer_email: string | null;
  customer_details?: { email?: string | null } | null;
  metadata: Record<string, string> | null;
}

interface Purchase {
  account: string;
  accountId: string;
  ts: number;
  amount: number;
  currency: string;
  email: string;
  source: string;
  landing: string;
  product: string;
  identifier: string;
  promo: boolean;
}

interface AccountResult {
  id: string;
  label: string;
  ok: boolean;
  count: number;
  gross: number;
  error?: string;
}

async function fetchSessions(key: string, sinceUnix: number): Promise<CheckoutSession[]> {
  const auth = Buffer.from(`${key}:`).toString('base64');
  const all: CheckoutSession[] = [];
  let starting_after: string | undefined;
  for (let page = 0; page < 5; page++) {
    const url = new URL('https://api.stripe.com/v1/checkout/sessions');
    url.searchParams.set('limit', '100');
    url.searchParams.set('created[gte]', String(sinceUnix));
    if (starting_after) url.searchParams.set('starting_after', starting_after);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Stripe HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = await res.json();
    const batch: CheckoutSession[] = data.data || [];
    all.push(...batch);
    if (!data.has_more || batch.length === 0) break;
    starting_after = batch[batch.length - 1].id;
  }
  return all;
}

function pickSource(meta: Record<string, string> | null): string {
  if (!meta) return 'direct';
  const referrer = (meta.referrer_source || meta.referrerSource || '').toLowerCase().trim();
  const utm = (meta.utm_source || meta.utmSource || '').toLowerCase().trim();
  const raw = referrer || utm || '';
  if (!raw) return 'direct';
  if (raw.includes('chatgpt')) return 'chatgpt';
  if (raw.includes('perplexity')) return 'perplexity';
  if (raw.includes('claude')) return 'claude';
  if (raw.includes('copilot')) return 'copilot';
  if (raw.includes('google')) return 'google';
  if (raw.includes('bing')) return 'bing';
  if (raw.includes('checkout.stripe')) return 'stripe-resume';
  return raw;
}

function pickLanding(meta: Record<string, string> | null): string {
  if (!meta) return '(none)';
  const lp = meta.landing_page || meta.landingPage || '';
  if (!lp) return '(none)';
  if (lp === '/' || lp === '') return '(home)';
  return lp.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
}

function pickProduct(meta: Record<string, string> | null): string {
  if (!meta) return '—';
  return meta.product || meta.productType || meta.tier || meta.plan || '—';
}

function pickIdentifier(meta: Record<string, string> | null): string {
  if (!meta) return '';
  return meta.reg || meta.postcode || meta.address || meta.fine_id || meta.fineId || '';
}

function buildMessage(purchases: Purchase[], accounts: AccountResult[], windowHours: number): string {
  const dateLabel = formatLondonDate();
  const totalGross = purchases.reduce((s, p) => s + (p.promo ? 0 : p.amount), 0);
  const paidCount = purchases.filter((p) => !p.promo).length;
  const promoCount = purchases.filter((p) => p.promo).length;

  const parts: string[] = [];
  parts.push(`<b>💰 Daily revenue · ${escapeHtml(dateLabel)}</b>`);
  parts.push(`<i>Last ${windowHours}h across all Stripe accounts</i>`);
  parts.push('');

  if (paidCount === 0 && promoCount === 0) {
    parts.push('No purchases in the window.');
  } else {
    parts.push(
      `<b>${paidCount} paid · £${(totalGross / 100).toFixed(2)} gross</b>${promoCount > 0 ? ` · ${promoCount} promo` : ''}`
    );
  }
  parts.push('');

  const byAccount = new Map<string, { count: number; gross: number }>();
  for (const p of purchases) {
    const cur = byAccount.get(p.account) || { count: 0, gross: 0 };
    cur.count += 1;
    if (!p.promo) cur.gross += p.amount;
    byAccount.set(p.account, cur);
  }
  if (byAccount.size > 0) {
    parts.push('<b>By site</b>');
    for (const [name, agg] of [...byAccount.entries()].sort((a, b) => b[1].gross - a[1].gross)) {
      parts.push(`• ${escapeHtml(name)}: ${agg.count} (£${(agg.gross / 100).toFixed(2)})`);
    }
    parts.push('');
  }

  if (purchases.length > 0) {
    parts.push('<b>Purchases</b>');
    purchases
      .sort((a, b) => a.ts - b.ts)
      .forEach((p, i) => {
        const time = formatLondonTime(p.ts);
        const amt = p.promo ? 'promo' : `£${(p.amount / 100).toFixed(2)}`;
        const id = p.identifier ? ` · <code>${escapeHtml(p.identifier)}</code>` : '';
        parts.push(
          `${i + 1}. ${escapeHtml(time)} · <b>${escapeHtml(p.account)}</b> · ${escapeHtml(p.product)} · ${escapeHtml(amt)}${id}`
        );
        parts.push(
          `   src: <i>${escapeHtml(p.source)}</i> · land: <code>${escapeHtml(p.landing)}</code> · ${escapeHtml(p.email)}`
        );
      });
    parts.push('');
  }

  if (purchases.length > 0) {
    const bySource = new Map<string, { count: number; gross: number }>();
    const byLanding = new Map<string, { count: number; gross: number }>();
    for (const p of purchases) {
      const s = bySource.get(p.source) || { count: 0, gross: 0 };
      s.count += 1;
      if (!p.promo) s.gross += p.amount;
      bySource.set(p.source, s);

      const l = byLanding.get(p.landing) || { count: 0, gross: 0 };
      l.count += 1;
      if (!p.promo) l.gross += p.amount;
      byLanding.set(p.landing, l);
    }

    parts.push('<b>By source</b>');
    [...bySource.entries()]
      .sort((a, b) => b[1].gross - a[1].gross)
      .slice(0, 8)
      .forEach(([k, v]) => parts.push(`• ${escapeHtml(k)}: ${v.count} (£${(v.gross / 100).toFixed(2)})`));
    parts.push('');

    parts.push('<b>By landing</b>');
    [...byLanding.entries()]
      .sort((a, b) => b[1].gross - a[1].gross)
      .slice(0, 8)
      .forEach(([k, v]) => parts.push(`• <code>${escapeHtml(k)}</code>: ${v.count} (£${(v.gross / 100).toFixed(2)})`));
    parts.push('');
  }

  const failures = accounts.filter((a) => !a.ok);
  if (failures.length === 0) {
    parts.push('✅ All Stripe accounts queried successfully');
  } else {
    parts.push(`⚠️ <b>${failures.length} account${failures.length > 1 ? 's' : ''} failed</b>`);
    for (const f of failures) {
      parts.push(`• ${escapeHtml(f.label)}: ${escapeHtml(f.error || 'unknown')}`);
    }
  }
  return parts.join('\n');
}

async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const hours = Number(url.searchParams.get('hours') || '24');
  const sinceUnix = Math.floor(Date.now() / 1000) - hours * 3600;

  const purchases: Purchase[] = [];
  const accountResults: AccountResult[] = [];

  for (const acct of ACCOUNTS) {
    const key = process.env[acct.envVar];
    if (!key) {
      accountResults.push({ id: acct.id, label: acct.label, ok: false, count: 0, gross: 0, error: 'env var not set' });
      continue;
    }
    try {
      const sessions = await fetchSessions(key, sinceUnix);
      const paid = sessions.filter(
        (s) => s.payment_status === 'paid' || (s.status === 'complete' && (s.amount_total ?? 0) === 0)
      );
      let gross = 0;
      for (const s of paid) {
        const amount = s.amount_total ?? 0;
        const isPromo = amount === 0;
        if (!isPromo) gross += amount;
        const email =
          s.customer_email ||
          s.customer_details?.email ||
          s.metadata?.email ||
          '—';
        purchases.push({
          account: acct.label,
          accountId: acct.id,
          ts: s.created,
          amount,
          currency: (s.currency || 'gbp').toUpperCase(),
          email,
          source: pickSource(s.metadata),
          landing: pickLanding(s.metadata),
          product: pickProduct(s.metadata),
          identifier: pickIdentifier(s.metadata),
          promo: isPromo,
        });
      }
      accountResults.push({ id: acct.id, label: acct.label, ok: true, count: paid.length, gross });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      accountResults.push({ id: acct.id, label: acct.label, ok: false, count: 0, gross: 0, error: msg });
    }
  }

  const message = buildMessage(purchases, accountResults, hours);

  if (dryRun) {
    return NextResponse.json({ message, accountResults, purchaseCount: purchases.length }, { status: 200 });
  }

  const tg = await sendTelegram(message);

  // Piggyback the daily Amazon invitation-to-buy check here to stay within the
  // Vercel Hobby cron limits (separate Telegram message, sent only when an invite lands).
  let amazonInvite: unknown = null;
  try {
    const { checkAmazonInvites } = await import('@/lib/amazon-invite');
    amazonInvite = await checkAmazonInvites();
  } catch (err) {
    amazonInvite = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // Daily GetYourGuide affiliate earnings: scan the last ~2 days of booking/payout
  // emails, update the pending/paid tables, and Telegram only if something new landed.
  let gygEarnings: unknown = null;
  try {
    const { updateGygEarnings } = await import('@/lib/gyg-earnings');
    gygEarnings = await updateGygEarnings({ notify: true });
  } catch (err) {
    gygEarnings = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(
    {
      ok: tg.ok,
      sent: tg.sent,
      telegramError: tg.error,
      accountResults,
      purchaseCount: purchases.length,
      amazonInvite,
      gygEarnings,
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
