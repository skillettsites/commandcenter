// Attributes a new shared-Supabase auth signup to the site it came from.
// auth.users carries no site column, so we infer it from (a) signup metadata that
// only one site sets, and (b) per-site activity tables keyed by user id / email.

function cleanEnv(v: string | undefined): string {
  return (v || '').trim().replace(/^"|"$/g, '').replace(/\\n$/, '');
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
const PROBES: Array<{ t: string; link: 'user_id' | 'email' | 'customer_email' | 'user_email'; site: string; label: (r: Record<string, unknown>) => string }> = [
  { t: 'premium_reports', link: 'user_id', site: 'CarCostCheck', label: (r) => `premium report ${r.registration || ''}`.trim() },
  { t: 'trade_checks', link: 'user_id', site: 'CarCostCheck', label: (r) => `vehicle check ${r.registration || ''}`.trim() },
  { t: 'trade_credits', link: 'user_id', site: 'CarCostCheck', label: (r) => `trade credits (${r.pack_type || ''})` },
  { t: 'reports', link: 'customer_email', site: 'HomeBuyerCheck / PostcodeCheck', label: (r) => `${r.tier || ''} property report`.trim() },
  { t: 'bmn_user_topics', link: 'user_id', site: 'BriefMyNews', label: (r) => `topic: ${r.topic || ''}` },
  { t: 'bmn_waitlist', link: 'email', site: 'BriefMyNews', label: () => 'waitlist' },
  { t: 'mms_profiles', link: 'email', site: 'MatchMySkillset', label: () => 'profile' },
  { t: 'mms_email_leads', link: 'email', site: 'MatchMySkillset', label: (r) => `skills lead${r.top_match ? ' -> ' + r.top_match : ''}` },
  { t: 'stay_analyses', link: 'email', site: 'FindYourStay', label: () => 'stay analysis' },
  { t: 'price_watches', link: 'user_email', site: 'FindYourStay', label: (r) => `price watch ${r.hotel_name || ''}`.trim() },
  { t: 'user_progress', link: 'user_id', site: 'AppealAFine (UK)', label: () => 'fine-appeal progress' },
  { t: 'user_progress_us', link: 'user_id', site: 'AppealAFine (US)', label: () => 'fine-appeal progress' },
];

export async function attributeSignup(record: SignupRecord): Promise<Attribution> {
  const meta = record.raw_user_meta_data || {};
  const id = record.id;
  const email = (record.email || '').toLowerCase();

  // 1. Metadata signals available the instant the account is created.
  const selectedPlan = typeof meta.selected_plan === 'string' ? meta.selected_plan : null;
  if (selectedPlan) return { site: 'AskYourStay', detail: `${selectedPlan} plan (trial)` };
  if (meta.account_type === 'trade' || meta.dealership_name) {
    return { site: 'CarCostCheck', detail: `trade account${meta.dealership_name ? ' (' + meta.dealership_name + ')' : ''}` };
  }

  // 2. Activity lookup (handles signups whose first site row already exists).
  for (const p of PROBES) {
    const linkVal = p.link === 'user_id' ? id : email;
    if (!linkVal) continue;
    const op = p.link === 'user_id' ? 'eq' : 'eq';
    const rows = await rest(`${p.t}?${p.link}=${op}.${encodeURIComponent(String(linkVal))}&select=*&limit=1`);
    if (rows.length) {
      let label: string | null = null;
      try { label = p.label(rows[0] as Record<string, unknown>); } catch { label = null; }
      return { site: p.site, detail: label };
    }
  }

  // 3. No signal yet — still a real signup, site will show on first activity.
  return { site: 'New account', detail: 'site not yet identified (no activity yet)' };
}
