import { NextResponse } from 'next/server';
import { sendTelegram, escapeHtml, formatLondonTime } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Receives a Supabase Database Webhook on auth.users INSERT and pings Telegram.
// Wire it up by running the SQL in scripts/signup-alert-trigger.sql against the
// shared Supabase project. The trigger sends an x-signup-secret header that must
// match SIGNUP_ALERT_SECRET.

interface SupabaseWebhookPayload {
  type?: string;
  table?: string;
  schema?: string;
  record?: {
    id?: string;
    email?: string | null;
    phone?: string | null;
    created_at?: string | null;
    raw_user_meta_data?: Record<string, unknown> | null;
    raw_app_meta_data?: Record<string, unknown> | null;
  } | null;
}

function authorized(req: Request): boolean {
  const secret = process.env.SIGNUP_ALERT_SECRET;
  if (!secret) return true; // not configured yet -> don't block, but log-only path
  const header = req.headers.get('x-signup-secret') || '';
  if (header === secret) return true;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let payload: SupabaseWebhookPayload;
  try {
    payload = (await req.json()) as SupabaseWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const record = payload.record;
  if (!record) {
    return NextResponse.json({ ok: false, error: 'no record' }, { status: 200 });
  }

  const email = record.email || record.phone || record.id || 'unknown';
  const meta = record.raw_user_meta_data || null;
  const appMeta = record.raw_app_meta_data || null;

  // Provider (email / google / etc.) lives in app metadata.
  const provider =
    pickString(appMeta, ['provider']) ||
    (Array.isArray(appMeta?.providers) ? String((appMeta!.providers as unknown[])[0]) : null) ||
    'email';

  // Site/source is only present if the signup code set it in user metadata.
  const site = pickString(meta, ['site', 'source', 'signup_site', 'app', 'brand', 'origin']);

  const tsSec = record.created_at ? Math.floor(new Date(record.created_at).getTime() / 1000) : Math.floor(Date.now() / 1000);
  const when = Number.isFinite(tsSec) ? formatLondonTime(tsSec) : '';

  const lines = [
    '🎉 <b>New signup</b>',
    `📧 ${escapeHtml(email)}`,
    site ? `🌐 ${escapeHtml(site)} · ${escapeHtml(provider)}` : `🔑 via ${escapeHtml(provider)}`,
    when ? `🕗 ${when}` : '',
  ].filter(Boolean);

  const result = await sendTelegram(lines.join('\n'));
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

// Allow a quick manual health check / test ping in the browser.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('test') === '1') {
    if (!authorized(req)) {
      return NextResponse.json({ ok: false, error: 'unauthorized (pass ?secret via header or use POST)' }, { status: 401 });
    }
    const result = await sendTelegram('✅ Signup alerts are wired up. This is a test ping.');
    return NextResponse.json(result);
  }
  return NextResponse.json({ ok: true, hint: 'POST Supabase auth.users INSERT webhooks here. GET ?test=1 with x-signup-secret to send a test ping.' });
}
