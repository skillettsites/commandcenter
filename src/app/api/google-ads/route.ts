import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ACC = '1096860797'; // CarCostCheck ad account
const MCC = '4341302949'; // Skillettsites manager

function ukDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
}

async function getToken(): Promise<string | undefined> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    refresh_token: process.env.GMAIL_REFRESH_TOKEN || '',
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  return j.access_token;
}

async function gaql(at: string, query: string) {
  const r = await fetch(`https://googleads.googleapis.com/v22/customers/${ACC}/googleAds:search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${at}`,
      'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
      'login-customer-id': MCC,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  return (j.results || []) as Array<{ metrics?: Record<string, string> }>;
}

function sum(rows: Array<{ metrics?: Record<string, string> }>) {
  let impressions = 0, clicks = 0, cost = 0;
  for (const x of rows) {
    impressions += Number(x.metrics?.impressions || 0);
    clicks += Number(x.metrics?.clicks || 0);
    cost += Number(x.metrics?.costMicros || 0) / 1e6;
  }
  return { impressions, clicks, cost: +cost.toFixed(2) };
}

// Ad-attributed sales = paid Stripe sessions carrying a gclid
async function adSales(monthStartUnix: number, todayStr: string) {
  const key = (process.env.STRIPE_KEY_CARCOSTCHECK || '').match(/sk_live_[A-Za-z0-9]+/)?.[0];
  if (!key) return { today: { n: 0, rev: 0 }, month: { n: 0, rev: 0 } };
  let after: string | undefined, paid: Array<Record<string, unknown>> = [], p = 0;
  while (p < 20) {
    const url = `https://api.stripe.com/v1/checkout/sessions?limit=100&created[gte]=${monthStartUnix}` + (after ? `&starting_after=${after}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json();
    const data = (j.data || []) as Array<Record<string, unknown>>;
    paid.push(...data.filter((s) => s.payment_status === 'paid'));
    p++;
    if (!j.has_more || !data.length) break;
    after = data[data.length - 1].id as string;
  }
  const isAd = (s: Record<string, unknown>) => {
    const m = (s.metadata || {}) as Record<string, string>;
    return !!(m.gclid || m.gbraid || m.wbraid);
  };
  const dateOf = (ts: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ts * 1000));
  const ad = paid.filter(isAd);
  const today = ad.filter((s) => dateOf(s.created as number) === todayStr);
  const rev = (arr: Array<Record<string, unknown>>) => +arr.reduce((a, s) => a + (Number(s.amount_total) || 0) / 100, 0).toFixed(2);
  return { today: { n: today.length, rev: rev(today) }, month: { n: ad.length, rev: rev(ad) } };
}

export async function GET() {
  try {
    const now = new Date();
    const todayStr = ukDate(now);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthStartStr = ukDate(monthStart);
    const monthStartUnix = Math.floor(monthStart.getTime() / 1000);

    const at = await getToken();
    if (!at) return NextResponse.json({ error: 'auth_failed' }, { status: 500 });

    const [todayRows, monthRows, sales] = await Promise.all([
      gaql(at, `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros FROM keyword_view WHERE campaign.status != 'REMOVED' AND segments.date = '${todayStr}'`),
      gaql(at, `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros FROM keyword_view WHERE campaign.status != 'REMOVED' AND segments.date BETWEEN '${monthStartStr}' AND '${todayStr}'`),
      adSales(monthStartUnix, todayStr),
    ]);

    const t = sum(todayRows), m = sum(monthRows);
    return NextResponse.json({
      today: { spend: t.cost, clicks: t.clicks, impressions: t.impressions, sales: sales.today.n, revenue: sales.today.rev },
      month: { spend: m.cost, clicks: m.clicks, impressions: m.impressions, sales: sales.month.n, revenue: sales.month.rev },
      updated: now.toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
