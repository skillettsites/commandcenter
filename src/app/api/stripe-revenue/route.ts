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
  const res = await fetch("https://api.stripe.com/v1/charges?limit=100", {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Stripe HTTP ${res.status}`);
  const data = await res.json();
  return data.data || [];
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
    };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;

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
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[stripe] ${account.name}:`, errMsg);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[stripe-revenue]", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
