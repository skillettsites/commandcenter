import { NextResponse } from "next/server";
import Stripe from "stripe";

interface AccountConfig {
  name: string;
  key: string;
  sites: string[];
}

// Only count revenue from March 2026 onwards (when we started tracking properly)
const REVENUE_START_DATE = new Date("2026-03-01T00:00:00Z").getTime() / 1000;

const ACCOUNTS: AccountConfig[] = [
  {
    name: "CarCostCheck",
    key: process.env.STRIPE_KEY_CARCOSTCHECK || "",
    sites: ["CarCostCheck"],
  },
  {
    name: "MatchMySkillset",
    key: process.env.STRIPE_KEY_MATCHMYSKILLSET || "",
    sites: ["MatchMySkillset"],
  },
  {
    name: "PostcodeCheck",
    key: process.env.STRIPE_KEY_POSTCODECHECK || "",
    sites: ["PostcodeCheck"],
  },
];

interface ChargeInfo {
  amount: number;
  site: string;
  email: string;
  date: string;
}

export async function GET() {
  try {
    const results: {
      accounts: Array<{
        name: string;
        sites: string[];
        totalRevenue: number;
        chargeCount: number;
        recentCharges: ChargeInfo[];
      }>;
      totalRevenue: number;
      totalCharges: number;
      thisMonthRevenue: number;
      thisMonthCharges: number;
    } = {
      accounts: [],
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
        const stripe = new Stripe(account.key);
        const charges = await stripe.charges.list({ limit: 100 });
        const paid = charges.data.filter(
          (c) => c.paid && !c.refunded && c.created >= REVENUE_START_DATE
        );

        const totalRevenue = paid.reduce((s, c) => s + c.amount, 0);
        const monthCharges = paid.filter((c) => c.created >= monthStart);
        const monthRevenue = monthCharges.reduce((s, c) => s + c.amount, 0);

        const recentCharges: ChargeInfo[] = paid.slice(0, 5).map((c) => ({
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
        console.error(`[stripe] Error fetching ${account.name}:`, err);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[stripe-revenue] Error:", error);
    return NextResponse.json({ error: "Failed to fetch Stripe data" }, { status: 500 });
  }
}
