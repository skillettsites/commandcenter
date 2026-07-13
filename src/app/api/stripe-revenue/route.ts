import { NextResponse } from "next/server";

interface AccountConfig {
  name: string;
  sites: string[];
  // "stripe": pull charges from the Stripe API using the env-var secret key.
  // "supabase": pull purchases from the shared Supabase `reports` table (used for
  //   sites whose Stripe key is marked Sensitive in Vercel and can't be read back,
  //   e.g. HomeBuyerCheck).
  source: "stripe" | "supabase";
  envVar?: string;
  // For source: "supabase" — the reports.tier values that belong to this site.
  // The shared `reports` table has no site_id column, so tier is the only
  // discriminator: HomeBuyerCheck writes standard/standard_plus/bundle,
  // PRSCheck writes licence_check. Without this, one supabase site would
  // scoop up the other's rows.
  supabaseTiers?: string[];
  // HomeBuyerCheck AND PRSCheck both sell on the same Stripe account as
  // PostcodeCheck ("Postcode Check") but are pulled authoritatively from the
  // Supabase reports table. A Stripe account flagged here has those sites'
  // payment_intents excluded to avoid counting each sale twice (once as PCC,
  // once as the supabase-sourced site).
  sharesAccountWithSupabaseSites?: boolean;
  // Legacy base64 fallback used only when the env-var key is unset/stale. SECURITY: these
  // live keys are already in this public repo's git history — they should be ROTATED, after
  // which both these literals and the matching env vars must be updated. Do NOT add new keys
  // here; new accounts (e.g. AppealAFine) use env vars only.
  fallbackB64?: string;
}

// Only count revenue from March 2026 onwards
const REVENUE_START_DATE = new Date("2026-03-01T00:00:00Z").getTime() / 1000;

const ACCOUNTS: AccountConfig[] = [
  {
    name: "CarCostCheck",
    source: "stripe",
    envVar: "STRIPE_KEY_CARCOSTCHECK",
    fallbackB64: "c2tfbGl2ZV81MVQ5UlB1SUhTb09UU0N6SFVsb3hUSkIzZGJVSmFZYW92ck1KeE5QTHRKR2M3WE1xeWJzQzQzMEdxZ0FObG1xVGlMNHNqbGhMTWhLc1VYbWdPMXZ1WXpsMjAwSlRNcWcxTGo=",
    sites: ["CarCostCheck"],
  },
  {
    name: "AppealAFine",
    source: "stripe",
    envVar: "STRIPE_KEY_APPEALAFINE",
    sites: ["AppealAFine"],
  },
  {
    name: "PostcodeCheck",
    source: "stripe",
    envVar: "STRIPE_KEY_POSTCODECHECK",
    fallbackB64: "c2tfbGl2ZV9aTnFRM3ZhalFLRTRvdlFLWjJYN1gwV0owMFFhU1hTaDlm",
    sites: ["PostcodeCheck"],
    sharesAccountWithSupabaseSites: true,
  },
  {
    name: "MatchMySkillset",
    source: "stripe",
    envVar: "STRIPE_KEY_MATCHMYSKILLSET",
    fallbackB64: "c2tfbGl2ZV81MVNqSWFTSTdvUkNGeVZyTExleVVVTjVVYURRQ1A5OGllWUlkbE5JeFdmT2FOb1FyMEdWc0d0dFJQZXNhTlhwbFQyNno2aGF2cnVMRmtndDlqV1ppTng0YTAwSll5OThRWTQ=",
    sites: ["MatchMySkillset"],
  },
  {
    name: "BriefMyNews",
    source: "stripe",
    envVar: "STRIPE_KEY_BRIEFMYNEWS",
    sites: ["BriefMyNews"],
  },
  {
    name: "HomeBuyerCheck",
    source: "supabase",
    sites: ["HomeBuyerCheck"],
    supabaseTiers: ["standard", "standard_plus", "bundle"],
  },
  {
    // PRSCheck's £9.99 landlord licence check sells on the shared Postcode Check
    // Stripe account and writes a reports row with tier "licence_check".
    name: "PRSCheck",
    source: "supabase",
    sites: ["PRSCheck"],
    supabaseTiers: ["licence_check"],
  },
];

// env values pulled from local .env files sometimes carry a trailing literal "\n".
function cleanEnv(v: string | undefined): string {
  return (v || "").replace(/\\n$/, "").trim();
}

// ─── Per-sale cost model (all pence) ─────────────────────────────────────────
// Profit = charge amount − Stripe processing fee − per-sale third-party API/data cost.
//
// Stripe fee: we use the ACTUAL fee Stripe recorded per charge (balance_transaction.fee,
// pulled via expand in fetchCharges) so it's exact per card type, not an estimate. Only
// the Supabase-sourced sites (HomeBuyerCheck) fall back to the 1.5% + 20p UK estimate.
const STRIPE_PCT = 0.015;
const STRIPE_FIXED = 20;

// CarCostCheck data cost varies by report. metadata.product is on the checkout SESSION,
// not the charge, so we classify by amount (prices are distinct enough that the ~10%
// promo/early-bird variance can't cross a band). Costs from the CCC codebase:
//   valuation £2.99 → AutoPredict £1.50 + Marketcheck £0.20      = 170p (no AutoCheck)
//   premium   £4.99 → AutoCheck £1.10                            = 110p
//   bundle    £6.99 → AutoCheck £1.10 + AutoPredict £1.50 + MC £0.20 = 280p
//   trade credit packs (≥ £30) → 0 at sale; the AutoCheck cost lands later when a credit is spent.
// Conservative: AutoCheck by-reg cache hits and skipped-Marketcheck (no mileage) make the
// real average slightly lower, so profit shown is a floor. Insurance-API cost is undocumented
// and not included.
function cccDataCost(amount: number): number {
  if (amount >= 3000) return 0;   // trade credit pack
  if (amount >= 600) return 280;  // bundle
  if (amount >= 350) return 110;  // premium
  return 170;                     // valuation
}

// Per-sale data/API cost for the non-CCC sites, in pence. These are ESTIMATES — replace
// with real figures when known. A missing account defaults to 0 (Stripe fee only).
const SALE_DATA_COST: Record<string, number> = {
  HomeBuyerCheck: 20,  // Claude report generation (est.)
  PostcodeCheck: 10,   // mostly free gov data + light AI (est.)
  PRSCheck: 0,         // free published council designations, no paid API
  AppealAFine: 15,     // AI appeal-letter generation (est.)
  MatchMySkillset: 20, // AI career analysis (est.)
  BriefMyNews: 10,     // AI digest (est.)
};

function realFee(c: StripeCharge): number | undefined {
  const bt = c.balance_transaction;
  return bt && typeof bt === "object" && typeof bt.fee === "number" ? bt.fee : undefined;
}

function chargeCost(accountName: string, amount: number, fee?: number): number {
  const stripeFee = fee != null ? fee : Math.round(amount * STRIPE_PCT) + STRIPE_FIXED;
  const dataCost = accountName === "CarCostCheck" ? cccDataCost(amount) : (SALE_DATA_COST[accountName] ?? 0);
  return stripeFee + dataCost;
}

interface StripeCharge {
  amount: number;
  paid: boolean;
  refunded: boolean;
  created: number;
  billing_details?: { email?: string };
  // Stripe charges carry this natively; Supabase rows map it from
  // stripe_payment_intent. Used to de-dupe the shared PCC/HBC/PRSCheck account.
  payment_intent?: string;
  // Only set on Supabase-sourced rows: reports.tier, used to attribute a row to
  // the right supabase site (HomeBuyerCheck vs PRSCheck).
  tier?: string;
  // Expanded on the Stripe pull so we can read the exact processing fee Stripe took.
  // A string (unexpanded id) or null for Supabase-sourced rows.
  balance_transaction?: { fee?: number } | string | null;
}

// HomeBuyerCheck's Stripe key is Sensitive in Vercel, so its authoritative purchase
// record is the Supabase `reports` table (the Stripe webhook writes a row per paid
// order). Real customer orders carry a live session id (cs_live_*); QA rows use
// qa_test_*/qatest* and are excluded by the like filter. amount_paid is in pence.
async function fetchSupabaseCharges(): Promise<StripeCharge[]> {
  const base = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !key) throw new Error("Supabase URL/service-role key not set");
  const q =
    "reports?select=created_at,amount_paid,customer_email,stripe_session_id,stripe_payment_intent,tier" +
    "&stripe_session_id=like.cs_live*&order=created_at.desc&limit=1000";
  const res = await fetch(`${base}/rest/v1/${q}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows: Array<{ created_at: string; amount_paid: number | null; customer_email: string | null; stripe_payment_intent: string | null; tier: string | null }> =
    await res.json();
  return rows.map((r) => ({
    amount: r.amount_paid ?? 0,
    paid: true,
    refunded: false,
    created: Math.floor(new Date(r.created_at).getTime() / 1000),
    billing_details: { email: r.customer_email || "Unknown" },
    payment_intent: r.stripe_payment_intent || undefined,
    tier: r.tier || undefined,
  }));
}

async function fetchCharges(key: string): Promise<StripeCharge[]> {
  const auth = Buffer.from(key + ":").toString("base64");
  const all: StripeCharge[] = [];
  let starting_after: string | undefined;
  // Pull EVERY charge since the revenue start, not just the most recent page or
  // two. We pass created[gte] so Stripe only returns in-window charges and
  // has_more naturally flips off once we've fetched them all; the 50-page cap
  // (5000 charges/account) is only a runaway safety valve. The previous 5-page
  // (500-charge) cap silently truncated high-volume accounts like CarCostCheck,
  // undercounting the "all time" total by hundreds of sales.
  for (let page = 0; page < 50; page++) {
    const url = new URL("https://api.stripe.com/v1/charges");
    url.searchParams.set("limit", "100");
    url.searchParams.set("created[gte]", String(Math.floor(REVENUE_START_DATE)));
    // Pull the real processing fee Stripe took on each charge for exact profit.
    url.searchParams.append("expand[]", "data.balance_transaction");
    if (starting_after) url.searchParams.set("starting_after", starting_after);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Stripe HTTP ${res.status}`);
    const data = await res.json();
    const batch: (StripeCharge & { id: string })[] = data.data || [];
    all.push(...batch);
    if (!data.has_more || batch.length === 0) break;
    starting_after = batch[batch.length - 1].id;
  }
  return all;
}

function utcDateKey(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const results = {
      accounts: [] as Array<{
        name: string;
        sites: string[];
        totalRevenue: number;
        chargeCount: number;
        todayRevenue: number;
        todayCharges: number;
        thisMonthRevenue: number;
        thisMonthCharges: number;
        totalProfit: number;
        todayProfit: number;
        thisMonthProfit: number;
        recentCharges: Array<{ amount: number; site: string; email: string; date: string }>;
        dailySeries: Array<{ date: string; revenue: number; charges: number; profit: number }>;
      }>,
      totalRevenue: 0,
      totalCharges: 0,
      thisMonthRevenue: 0,
      thisMonthCharges: 0,
      todayRevenue: 0,
      todayCharges: 0,
      totalProfit: 0,
      thisMonthProfit: 0,
      todayProfit: 0,
      dailySeries: [] as Array<{ date: string; revenue: number; charges: number; profit: number }>,
    };

    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;

    // Prefill daily buckets from revenue start to today (UTC)
    const buckets = new Map<string, { revenue: number; charges: number; profit: number }>();
    const startDay = new Date(REVENUE_START_DATE * 1000);
    const endDay = new Date(todayStart * 1000);
    for (
      let d = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate());
      d <= endDay.getTime();
      d += 86400000
    ) {
      buckets.set(new Date(d).toISOString().slice(0, 10), { revenue: 0, charges: 0, profit: 0 });
    }

    // The Supabase `reports` table is the authoritative source for the sites
    // whose Stripe key can't be read back (HomeBuyerCheck, PRSCheck), and those
    // sites share the Postcode Check Stripe account. Fetch every reports row once
    // up front so we can attribute each supabase site by tier AND exclude their
    // payment_intents from the shared Stripe pull (otherwise each sale counts
    // twice — once as PostcodeCheck, once as the supabase-sourced site).
    let supabaseCharges: StripeCharge[] = [];
    let supabasePaymentIntents = new Set<string>();
    try {
      supabaseCharges = await fetchSupabaseCharges();
      supabasePaymentIntents = new Set(
        supabaseCharges.map((c) => c.payment_intent).filter((p): p is string => !!p)
      );
    } catch (err) {
      console.error("[stripe] supabase prefetch:", err instanceof Error ? err.message : String(err));
    }

    for (const account of ACCOUNTS) {
      try {
        let allCharges: StripeCharge[];
        if (account.source === "supabase") {
          // Attribute only this site's tiers (the reports table has no site_id).
          const tiers = account.supabaseTiers ?? [];
          allCharges = supabaseCharges.filter((c) => tiers.includes(c.tier ?? ""));
        } else {
          const key =
            cleanEnv(process.env[account.envVar!]) ||
            (account.fallbackB64 ? Buffer.from(account.fallbackB64, "base64").toString() : "");
          if (!key) continue;
          allCharges = await fetchCharges(key);
          // Drop sales that live on this shared Stripe account but are counted
          // via the Supabase source (HomeBuyerCheck, PRSCheck).
          if (account.sharesAccountWithSupabaseSites && supabasePaymentIntents.size > 0) {
            allCharges = allCharges.filter(
              (c) => !c.payment_intent || !supabasePaymentIntents.has(c.payment_intent)
            );
          }
        }
        const paid = allCharges.filter(
          (c) => c.paid && !c.refunded && c.created >= REVENUE_START_DATE
        );

        // Price each charge once: profit = amount − (real) Stripe fee − per-sale data cost.
        const priced = paid.map((c) => {
          const profit = c.amount - chargeCost(account.name, c.amount, realFee(c));
          return { c, profit };
        });

        const totalRevenue = priced.reduce((s, p) => s + p.c.amount, 0);
        const totalProfit = priced.reduce((s, p) => s + p.profit, 0);
        const monthPriced = priced.filter((p) => p.c.created >= monthStart);
        const monthRevenue = monthPriced.reduce((s, p) => s + p.c.amount, 0);
        const monthProfit = monthPriced.reduce((s, p) => s + p.profit, 0);
        const todayPriced = priced.filter((p) => p.c.created >= todayStart);
        const todayRevenue = todayPriced.reduce((s, p) => s + p.c.amount, 0);
        const todayProfit = todayPriced.reduce((s, p) => s + p.profit, 0);
        const monthCharges = monthPriced;
        const todayChargesList = todayPriced;

        // Per-account daily series (for the per-site graph) plus the global buckets.
        const acctBuckets = new Map<string, { revenue: number; charges: number; profit: number }>();
        for (const { c, profit } of priced) {
          const key = utcDateKey(c.created);
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.revenue += c.amount;
            bucket.charges += 1;
            bucket.profit += profit;
          }
          const ab = acctBuckets.get(key) ?? { revenue: 0, charges: 0, profit: 0 };
          ab.revenue += c.amount;
          ab.charges += 1;
          ab.profit += profit;
          acctBuckets.set(key, ab);
        }
        const acctDailySeries = Array.from(acctBuckets.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, v]) => ({ date, revenue: v.revenue, charges: v.charges, profit: v.profit }));

        const recentCharges = paid.slice(0, 5).map((c) => ({
          amount: c.amount,
          site: account.sites[0],
          email: c.billing_details?.email || "Unknown",
          date: new Date(c.created * 1000).toLocaleDateString("en-GB"),
        }));

        results.accounts.push({
          name: account.name,
          sites: account.sites,
          totalRevenue,
          chargeCount: paid.length,
          todayRevenue,
          todayCharges: todayChargesList.length,
          thisMonthRevenue: monthRevenue,
          thisMonthCharges: monthCharges.length,
          totalProfit,
          todayProfit,
          thisMonthProfit: monthProfit,
          recentCharges,
          dailySeries: acctDailySeries,
        });

        results.totalRevenue += totalRevenue;
        results.totalCharges += paid.length;
        results.thisMonthRevenue += monthRevenue;
        results.thisMonthCharges += monthCharges.length;
        results.todayRevenue += todayRevenue;
        results.todayCharges += todayChargesList.length;
        results.totalProfit += totalProfit;
        results.thisMonthProfit += monthProfit;
        results.todayProfit += todayProfit;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[stripe] ${account.name}:`, errMsg);
      }
    }

    results.dailySeries = Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, revenue: v.revenue, charges: v.charges, profit: v.profit }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("[stripe-revenue]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
