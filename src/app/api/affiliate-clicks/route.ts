import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ today: 0, month: 0, total: 0 });
  }

  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    // Fetch recent clicks for findyourstay
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/affiliate_clicks?site=eq.findyourstay&order=created_at.desc&limit=10000`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ today: 0, month: 0, total: 0 });
    }

    const clicks: { created_at: string }[] = await res.json();
    const today = clicks.filter((c) => c.created_at.startsWith(todayStr)).length;
    const month = clicks.filter((c) => c.created_at.startsWith(monthStr)).length;

    return NextResponse.json({ today, month, total: clicks.length });
  } catch {
    return NextResponse.json({ today: 0, month: 0, total: 0 });
  }
}
