// Attributes a new shared-Supabase auth signup to the site it came from.
// auth.users carries no site column, so we infer it from, in priority order:
//   1. signup metadata that exactly one site sets,
//   2. per-site app tables keyed by user id,
//   3. premium_reports.customer_email (CarCostCheck guest buyers who create an
//      account from the report page sign up with NO metadata),
//   4. fallback: HelpAfterLoss / HelpAfterLife, the only sites whose signup
//      sends no metadata and creates no row at signup time.
//
// NOTE: the shared `profiles` table is auto-created for EVERY auth user by the
// handle_new_user trigger (account_type defaults to "personal"), so a profiles
// row is NOT evidence of a CarCostCheck signup. Only signup *metadata* is.

function cleanEnv(v: string | undefined): string {
  return (v || '').trim().replace(/^"|"$/g, '').replace(/\\n$/, '').trim();
}

const SUPA = cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

export interface SignupRecord {
  id?: string;
  email?: string | null;
  raw_user_meta_data?: Record<string, unknown> | null;
  raw_app_meta_data?: Record<string, unknown> | null;
}

export interface Attribution {
  site: string;
  detail: string | null;
}

async function rest(path: string): Promise<unknown[]> {
  if (!SUPA || !KEY) return [];
  try {
    const r = await fetch(`${SUPA}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return [];
    return (await r.json()) as unknown[];
  } catch {
    return [];
  }
}

// Each probe: a per-site table, the column linking to the user, and a label.
// Ordered by reliability: tables that exist at (or within seconds of) signup
// first, activity tables that prove later engagement after.
const PROBES: Array<{ t: string; link: 'id' | 'user_id' | 'email' | 'customer_email' | 'user_email'; site: string; label: (r: Record<string, unknown>) => string }> = [
  // Tier 1: app profile/progress tables created by the owning site.
  { t: 'bmn_profiles', link: 'id', site: 'BriefMyNews', label: (r) => `profile${r.display_name ? ' (' + r.display_name + ')' : ''}` },
  { t: 'mms_profiles', link: 'id', site: 'MatchMySkillset', label: () => 'profile' },
  { t: 'properties', link: 'user_id', site: 'AskYourStay', label: (r) => `property ${r.name || r.title || ''}`.trim() },
  { t: 'user_progress', link: 'user_id', site: 'HelpAfterLoss', label: () => 'bereavement checklist progress' },
  { t: 'user_progress_us', link: 'user_id', site: 'HelpAfterLife', label: () => 'bereavement checklist progress' },
  // Tier 2: CarCostCheck purchases. Guest report buyers create their account
  // from the report page AFTER paying, so the report row (matched on the
  // Stripe customer email) already exists when the signup webhook fires.
  { t: 'premium_reports', link: 'customer_email', site: 'CarCostCheck', label: (r) => `premium report buyer ${r.registration || ''}`.trim() },
  { t: 'premium_reports', link: 'user_id', site: 'CarCostCheck', label: (r) => `premium report ${r.registration || ''}`.trim() },
  { t: 'trade_checks', link: 'user_id', site: 'CarCostCheck', label: (r) => `vehicle check ${r.registration || ''}`.trim() },
  { t: 'trade_credits', link: 'user_id', site: 'CarCostCheck', label: (r) => `trade credits (${r.pack_type || ''})` },
  { t: 'subscriptions', link: 'user_id', site: 'CarCostCheck', label: (r) => `subscription (${r.status || ''})` },
  // Tier 3: other per-site activity tables.
  { t: 'reports', link: 'customer_email', site: 'HomeBuyerCheck / PostcodeCheck', label: (r) => `${r.tier || ''} property report`.trim() },
  { t: 'bmn_user_topics', link: 'user_id', site: 'BriefMyNews', label: (r) => `topic: ${r.topic || ''}` },
  { t: 'bmn_waitlist', link: 'email', site: 'BriefMyNews', label: () => 'waitlist' },
  { t: 'mms_email_leads', link: 'email', site: 'MatchMySkillset', label: (r) => `skills lead${r.top_match ? ' -> ' + r.top_match : ''}` },
  { t: 'stay_analyses', link: 'email', site: 'FindYourStay', label: () => 'stay analysis' },
  { t: 'price_watches', link: 'user_email', site: 'FindYourStay', label: (r) => `price watch ${r.hotel_name || ''}`.trim() },
];

export async function attributeSignup(record: SignupRecord): Promise<Attribution> {
  const meta = record.raw_user_meta_data || {};
  const id = record.id;
  const email = (record.email || '').toLowerCase();

  // 1. Metadata signals available the instant the account is created. Each of
  // these keys is written by exactly one site's signup form.
  const selectedPlan = typeof meta.selected_plan === 'string' ? meta.selected_plan : null;
  if (selectedPlan) return { site: 'AskYourStay', detail: `${selectedPlan} plan (trial)` };
  if (meta.account_type === 'trade' || meta.dealership_name) {
    return { site: 'CarCostCheck', detail: `trade account${meta.dealership_name ? ' (' + meta.dealership_name + ')' : ''}` };
  }
  if (typeof meta.account_type === 'string' && meta.account_type) {
    // Only CarCostCheck's signup form stamps account_type into auth metadata.
    return { site: 'CarCostCheck', detail: `${meta.account_type} account` };
  }
  if (typeof meta.display_name === 'string' && meta.display_name) {
    // Only BriefMyNews' signup API stamps display_name into auth metadata.
    return { site: 'BriefMyNews', detail: `display name: ${meta.display_name}` };
  }

  // 2. App-table / purchase lookup, in priority order.
  for (const p of PROBES) {
    const byEmail = p.link === 'email' || p.link === 'customer_email' || p.link === 'user_email';
    const linkVal = byEmail ? email : id;
    if (!linkVal) continue;
    // ilike (no wildcards) = case-insensitive equality, emails vary in case.
    const op = byEmail ? 'ilike' : 'eq';
    const rows = await rest(`${p.t}?${p.link}=${op}.${encodeURIComponent(String(linkVal))}&select=*&limit=1`);
    if (rows.length) {
      let label: string | null = null;
      try { label = p.label(rows[0] as Record<string, unknown>); } catch { label = null; }
      return { site: p.site, detail: label };
    }
  }

  // 3. No metadata, no purchase, no app row. HelpAfterLoss and HelpAfterLife
  // are the only sites that sign users up bare like this (their first
  // user_progress row only appears once the user saves checklist progress).
  return {
    site: 'HelpAfterLoss / HelpAfterLife (probable)',
    detail: 'no signup metadata or purchase; only HAL/HALife sign up users this way',
  };
}
