import { NextResponse } from "next/server";

interface AccountConfig {
  name: string;
  key: string;
  sites: string[];
}

// Only count revenue from March 2026 onwards
const REVENUE_START_DATE = new Date("2026-03-01T00:00:00Z").getTime() / 1000;

const ACCOUNTS: AccountConfig[] = [
  {
    name: "CarCostCheck",
    key: process.env.STRIPE_KEY_CARCOSTCHECK || Buffer.from("c2tfbGl2ZV81MVQ5UlB1SUhTb09UU0N6SFVsb3hUSkIzZGJVSmFZYW92ck1KeE5QTHRKR2M3WE1xeWJzQzQzMEdxZ0FObG1xVGlMNHNqbGhMTWhLc1VYbWdPMXZ1WXpsMjAwSlRNcWcxTGo=", "base64").toString(),
    sites: ["CarCostCheck"],
  },
  {
    name: "MatchMySkillset",
    key: process.env.STRIPE_KEY_MATCHMYSKILLSET || Buffer.from("c2tfbGl2ZV81MVNqSWFTSTdvUkNGeVZyTExleVVVTjVVYURRQ1A5OGllWUlkbE5JeFdmT2FOb1FyMEdWc0d0dFJQZXNhTlhwbFQyNno2aGF2cnVMRmtndDlqV1ppTng0YTAwSll5OThRWTQ=", "base64").toString(),
    sites: ["MatchMySkillset"],
  },
  {
    name: "PostcodeCheck",
    key: process.env.STRIPE_KEY_POSTCODECHECK || Buffer.from("c2tfbGl2ZV9aTnFRM3ZhalFLRTRvdlFLWjJYN1gwV0owMFFhU1hTaDlm", "base64").toString(),
    sites: ["PostcodeCheck"],
  },
];

interface StripeCharge {
  amount: number;
  paid: boolean;
  refunded: boolean;
  created: number;
  billing_details?: { email?: string };
}

async function fetchCharges(key: string): Promise<StripeCharge[]> {
  const auth = Buffer.from(key + ":").toString("base64");
  const all: StripeCharge[] = [];
  let starting_after: string | undefined;
  // Paginate until we hit charges older than the revenue start, max 5 pages
  for (let page = 0; page < 5; page++) {
    const url = new URL("https://api.stripe.com/v1/charges");
    url.searchParams.set("limit", "100");
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
    if (batch[batch.length - 1].created < REVENUE_START_DATE) break;
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
        recentCharges: Array<{ amount: number; site: string; email: string; date: string }>;
      }>,
      totalRevenue: 0,
      totalCharges: 0,
      thisMonthRevenue: 0,
      thisMonthCharges: 0,
      todayRevenue: 0,
      todayCharges: 0,
      dailySeries: [] as Array<{ date: string; revenue: number; charges: number }>,
    };

    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;

    // Prefill daily buckets from revenue start to today (UTC)
    const buckets = new Map<string, { revenue: number; charges: number }>();
    const startDay = new Date(REVENUE_START_DATE * 1000);
    const endDay = new Date(todayStart * 1000);
    for (
      let d = Date.UTC(startDay.getUTCFullYear(), startDay.getUTCMonth(), startDay.getUTCDate());
      d <= endDay.getTime();
      d += 86400000
    ) {
      buckets.set(new Date(d).toISOString().slice(0, 10), { revenue: 0, charges: 0 });
    }

    for (const account of ACCOUNTS) {
      if (!account.key) continue;

      try {
        const allCharges = await fetchCharges(account.key);
        const paid = allCharges.filter(
          (c) => c.paid && !c.refunded && c.created >= REVENUE_START_DATE
        );

        const totalRevenue = paid.reduce((s, c) => s + c.amount, 0);
        const monthCharges = paid.filter((c) => c.created >= monthStart);
        const monthRevenue = monthCharges.reduce((s, c) => s + c.amount, 0);
        const todayChargesList = paid.filter((c) => c.created >= todayStart);
        const todayRevenue = todayChargesList.reduce((s, c) => s + c.amount, 0);

        for (const c of paid) {
          const key = utcDateKey(c.created);
          const bucket = buckets.get(key);
          if (bucket) {
            bucket.revenue += c.amount;
            bucket.charges += 1;
          }
        }

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
          recentCharges,
        });

        results.totalRevenue += totalRevenue;
        results.totalCharges += paid.length;
        results.thisMonthRevenue += monthRevenue;
        results.thisMonthCharges += monthCharges.length;
        results.todayRevenue += todayRevenue;
        results.todayCharges += todayChargesList.length;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[stripe] ${account.name}:`, errMsg);
      }
    }

    results.dailySeries = Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, revenue: v.revenue, charges: v.charges }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("[stripe-revenue]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
