// One-off: attribute every existing auth.users signup to a site + what they signed
// up for, then (optionally) Telegram a backfill summary. Read-only against Supabase.
import fs from 'node:fs';

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/^"|"$/g, '').replace(/\\n$/, '') : '';
};
const SUPA = 'https://noxczmrnyyosgvvjlqca.supabase.co';
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
const BOT = get('TELEGRAM_BOT_TOKEN');
const CHAT = get('TELEGRAM_CHAT_ID');
const SEND = process.argv.includes('--send');

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const rest = async (path) => {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, { headers: H });
  if (!r.ok) return [];
  return r.json();
};

// 1. Load all auth users.
const au = await (await fetch(`${SUPA}/auth/v1/admin/users?per_page=500`, { headers: H })).json();
const users = (au.users || []).map((u) => ({
  id: u.id,
  email: (u.email || '').toLowerCase(),
  created: u.created_at,
  plan: u.user_metadata?.selected_plan || u.user_metadata?.account_type || u.app_metadata?.tier || null,
  ays: u.user_metadata?.selected_plan || null, // only AskYourStay's signup sets selected_plan
  name: u.user_metadata?.full_name || u.user_metadata?.display_name || null,
  sites: new Map(), // site -> details[]
}));
const byId = new Map(users.map((u) => [u.id, u]));
const byEmail = new Map(users.map((u) => [u.email, u]));

// 2. Attribution sources. ACTIVITY tables prove a site. `profiles` is auto-created
// for every signup (ensure_profile RPC) so it is NOT a site signal on its own —
// only treat it as CarCostCheck when it carries trade/dealership data.
const SOURCES = [
  { t: 'profiles', link: 'id', site: 'CarCostCheck', weak: true, what: (r) => (r.account_type === 'trade' || r.dealership_name) ? `trade account${r.dealership_name ? ' (' + r.dealership_name + ')' : ''}` : null },
  { t: 'trade_credits', link: 'user_id', site: 'CarCostCheck', what: (r) => `trade credits: ${r.pack_type || ''} (${r.credits_remaining}/${r.credits_purchased} left)` },
  { t: 'trade_checks', link: 'user_id', site: 'CarCostCheck', what: (r) => `vehicle check ${r.registration || ''}` },
  { t: 'subscriptions', link: 'user_id', site: 'CarCostCheck', what: (r) => `subscription (${r.status})` },
  { t: 'premium_reports', link: 'user_id', site: 'CarCostCheck', what: (r) => `premium report ${r.registration || ''}` },
  { t: 'mms_profiles', link: 'email', site: 'MatchMySkillset', what: (r) => `profile${r.role ? ' (' + r.role + ')' : ''}` },
  { t: 'mms_email_leads', link: 'email', site: 'MatchMySkillset', what: (r) => `skills assessment lead${r.top_match ? ' -> ' + r.top_match : ''}` },
  { t: 'mms_skill_assessments', link: 'user_id', site: 'MatchMySkillset', what: () => 'skill assessment' },
  { t: 'mms_job_clicks', link: 'user_id', site: 'MatchMySkillset', what: () => 'job clicks' },
  { t: 'bmn_waitlist', link: 'email', site: 'BriefMyNews', what: () => 'waitlist' },
  { t: 'bmn_user_topics', link: 'user_id', site: 'BriefMyNews', what: (r) => `topic: ${r.topic || ''}${r.frequency ? ' (' + r.frequency + ')' : ''}` },
  { t: 'bmn_digests', link: 'user_id', site: 'BriefMyNews', what: (r) => `digest sent${r.topic ? ': ' + r.topic : ''}` },
  { t: 'user_progress', link: 'user_id', site: 'AppealAFine (UK)', what: () => 'fine-appeal progress' },
  { t: 'user_progress_us', link: 'user_id', site: 'AppealAFine (US)', what: () => 'fine-appeal progress' },
  { t: 'reports', link: 'customer_email', site: 'HomeBuyerCheck / PostcodeCheck', what: (r) => `${r.tier || ''} property report` },
  { t: 'stay_analyses', link: 'email', site: 'FindYourStay', what: (r) => `stay analysis${r.listing_title ? ' (' + r.listing_title + ')' : ''}` },
  { t: 'price_watches', link: 'user_email', site: 'FindYourStay', what: (r) => `price watch ${r.hotel_name || ''}` },
  { t: 'newsletter_subscribers', link: 'email', site: 'Newsletter', what: (r) => `newsletter${r.source ? ' (' + r.source + ')' : ''}` },
];

for (const s of SOURCES) {
  const rows = await rest(`${s.t}?select=*`);
  for (const r of rows) {
    const linkVal = s.link.includes('email')
      ? String(r[s.link] || '').toLowerCase()
      : r[s.link];
    const u = (s.link.includes('email') ? byEmail.get(linkVal) : byId.get(linkVal));
    if (!u) continue;
    if (s.weak) u.hasProfile = true;
    let detail;
    try { detail = s.what(r); } catch { detail = 'signup'; }
    // Weak sources (profiles) only count as a site when they return real detail (trade).
    if (s.weak && !detail) continue;
    if (!u.sites.has(s.site)) u.sites.set(s.site, new Set());
    if (detail) u.sites.get(s.site).add(detail);
  }
}

// Metadata signals (present from the moment of signup, before any activity).
for (const u of users) {
  // Only AskYourStay's signup writes selected_plan into auth user_metadata.
  if (u.ays && !u.sites.has('AskYourStay')) {
    u.sites.set('AskYourStay', new Set([`${u.ays} plan (trial)`]));
  }
}
// Email-prefix heuristic for any remaining accounts with no activity rows.
for (const u of users) {
  if (u.sites.size) continue;
  if (/^bmn[-.]/.test(u.email)) u.sites.set('BriefMyNews', new Set(['QA / test account']));
}

// 3. Report.
users.sort((a, b) => String(a.created).localeCompare(String(b.created)));
const fmt = (iso) => (iso || '').slice(0, 10);
console.log(`Total signups: ${users.length}\n`);
const lines = [];
for (const u of users) {
  const siteStr = u.sites.size
    ? [...u.sites.entries()].map(([site, w]) => `${site} — ${[...w].filter(Boolean).join('; ')}`).join(' | ')
    : (u.hasProfile ? 'Account only — no site activity yet (profile created, site unclear)' : 'UNATTRIBUTED (auth only)');
  const line = `${fmt(u.created)}  ${u.email}${u.plan ? '  [' + u.plan + ']' : ''}\n   ${siteStr}`;
  console.log(line);
  lines.push({ created: fmt(u.created), email: u.email, sites: [...u.sites.keys()], siteStr });
}

// Site totals.
const totals = {};
for (const u of users) {
  const ks = u.sites.size ? [...u.sites.keys()] : [u.hasProfile ? 'Account only (site unclear)' : 'UNATTRIBUTED'];
  for (const k of ks) totals[k] = (totals[k] || 0) + 1;
}
console.log('\n--- by site ---');
for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) console.log(`${v}  ${k}`);

// 4. Optional Telegram backfill summary.
if (SEND && BOT && CHAT) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = `📋 <b>Signup backfill</b> — ${users.length} existing accounts\n`;
  const body = users.map((u) => {
    const siteStr = u.sites.size
      ? [...u.sites.entries()].map(([site, w]) => `${site}: ${[...w].filter(Boolean).join('; ')}`).join(' | ')
      : (u.hasProfile ? 'account only — site unclear' : 'auth only');
    return `• ${fmt(u.created)} — ${esc(u.email)}\n  ${esc(siteStr)}`;
  }).join('\n');
  const tot = '\n\n<b>By site:</b>\n' + Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${esc(k)}`).join('\n');
  const text = head + body + tot;
  // Telegram 4096 char cap -> chunk.
  const chunks = [];
  let rest2 = text;
  while (rest2.length > 3800) { let c = rest2.lastIndexOf('\n', 3800); if (c < 1000) c = 3800; chunks.push(rest2.slice(0, c)); rest2 = rest2.slice(c).replace(/^\n+/, ''); }
  if (rest2) chunks.push(rest2);
  for (const ch of chunks) {
    const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: ch, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    console.log('telegram:', r.status, (await r.text()).slice(0, 120));
  }
}
