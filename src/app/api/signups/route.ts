import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Aggregates shared-Supabase auth signups for the dashboard Users section.
// Attribution is cheap and batched (one query per probe table, not per user) —
// the precise per-user audit lives in the `users` skill.

function cleanEnv(v: string | undefined): string {
  return (v || '').trim().replace(/^"|"$/g, '').replace(/\\n$/, '').trim();
}
const SUPA = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL) || cleanEnv(process.env.SUPABASE_URL);
const KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

interface AuthUser {
  id: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown> | null;
}

// One query per table — pull just the linking column, build a Set.
async function fetchKeySet(table: string, col: string, lower = false): Promise<Set<string>> {
  if (!SUPA || !KEY) return new Set();
  try {
    const r = await fetch(`${SUPA}/rest/v1/${table}?select=${col}&limit=20000`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return new Set();
    const rows = (await r.json()) as Record<string, unknown>[];
    const s = new Set<string>();
    for (const row of rows) {
      const v = row[col];
      if (typeof v === 'string' && v) s.add(lower ? v.toLowerCase() : v);
    }
    return s;
  } catch {
    return new Set();
  }
}

function metaGuess(meta: Record<string, unknown>): { site: string; detail: string } | null {
  if (typeof meta.selected_plan === 'string' && meta.selected_plan) return { site: 'AskYourStay', detail: `${meta.selected_plan} plan` };
  if (meta.account_type === 'trade' || meta.dealership_name) return { site: 'CarCostCheck', detail: 'trade account' };
  if (typeof meta.account_type === 'string' && meta.account_type) return { site: 'CarCostCheck', detail: `${meta.account_type} account` };
  if (typeof meta.display_name === 'string' && meta.display_name) return { site: 'BriefMyNews', detail: 'account' };
  return null;
}

export async function GET(_req: NextRequest) {
  let client;
  try {
    client = getServiceClient();
  } catch {
    return NextResponse.json({ error: 'supabase not configured', total: 0, byDate: [], bySite: [], recent: [] }, { status: 200 });
  }

  // Paginate auth.users (admin API).
  const users: AuthUser[] = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      users.push(...(data.users as unknown as AuthUser[]));
      if (data.users.length < 1000) break;
    }
  } catch {
    return NextResponse.json({ error: 'auth.admin unavailable', total: 0, byDate: [], bySite: [], recent: [] }, { status: 200 });
  }

  // Batched attribution sets (one query per table).
  const [mms, bmn, props, hal, halife, ccReports, reports] = await Promise.all([
    fetchKeySet('mms_profiles', 'id'),
    fetchKeySet('bmn_profiles', 'id'),
    fetchKeySet('properties', 'user_id'),
    fetchKeySet('user_progress', 'user_id'),
    fetchKeySet('user_progress_us', 'user_id'),
    fetchKeySet('premium_reports', 'customer_email', true),
    fetchKeySet('reports', 'customer_email', true),
  ]);

  function attribute(u: AuthUser): { site: string; detail: string } {
    const meta = u.user_metadata || {};
    const m = metaGuess(meta);
    if (m) return m;
    const id = u.id;
    const email = (u.email || '').toLowerCase();
    if (id && bmn.has(id)) return { site: 'BriefMyNews', detail: 'profile' };
    if (id && mms.has(id)) return { site: 'MatchMySkillset', detail: 'profile' };
    if (id && props.has(id)) return { site: 'AskYourStay', detail: 'property' };
    if (id && hal.has(id)) return { site: 'HelpAfterLoss', detail: 'checklist' };
    if (id && halife.has(id)) return { site: 'HelpAfterLife', detail: 'checklist' };
    if (email && ccReports.has(email)) return { site: 'CarCostCheck', detail: 'report buyer' };
    if (email && reports.has(email)) return { site: 'HomeBuyerCheck', detail: 'property report' };
    return { site: 'Other', detail: 'no signal' };
  }

  const now = Date.now();
  const DAY = 86400000;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * DAY;
  const monthAgo = now - 30 * DAY;

  let today = 0, week = 0, month = 0;
  const siteCounts = new Map<string, number>();
  const dateCounts = new Map<string, number>();

  const enriched = users.map((u) => {
    const ts = u.created_at ? new Date(u.created_at).getTime() : 0;
    const attr = attribute(u);
    siteCounts.set(attr.site, (siteCounts.get(attr.site) || 0) + 1);
    if (ts >= todayStart.getTime()) today++;
    if (ts >= weekAgo) week++;
    if (ts >= monthAgo) month++;
    if (ts >= monthAgo) {
      const d = new Date(ts).toISOString().slice(0, 10);
      dateCounts.set(d, (dateCounts.get(d) || 0) + 1);
    }
    return { email: u.email || '', created_at: u.created_at || '', site: attr.site, detail: attr.detail, ts };
  });

  // 30-day daily series (fill gaps).
  const byDate: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY).toISOString().slice(0, 10);
    byDate.push({ date: d, count: dateCounts.get(d) || 0 });
  }

  const bySite = Array.from(siteCounts.entries())
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => b.count - a.count);

  const recent = enriched
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 25)
    .map(({ email, created_at, site, detail }) => ({ email, created_at, site, detail }));

  return NextResponse.json({
    total: users.length,
    today,
    week,
    month,
    byDate,
    bySite,
    recent,
    timestamp: new Date().toISOString(),
  });
}
