import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

interface ClickRow {
  type: string;
  city: string;
  section: string;
  site: string;
  created_at: string;
}

interface SiteStats {
  today: number;
  month: number;
  total: number;
}

export async function GET(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ sites: {} });
  }

  const siteFilter = req.nextUrl.searchParams.get("site");

  try {
    let url = `${SUPABASE_URL}/rest/v1/affiliate_clicks?order=created_at.desc&limit=10000`;
    if (siteFilter) {
      url += `&site=eq.${siteFilter}`;
    }

    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ sites: {} });
    }

    const clicks: ClickRow[] = await res.json();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    // Group by site
    const siteMap: Record<string, ClickRow[]> = {};
    for (const c of clicks) {
      const s = c.site || "unknown";
      if (!siteMap[s]) siteMap[s] = [];
      siteMap[s].push(c);
    }

    const sites: Record<string, SiteStats> = {};
    for (const [site, rows] of Object.entries(siteMap)) {
      sites[site] = {
        today: rows.filter((c) => c.created_at.startsWith(todayStr)).length,
        month: rows.filter((c) => c.created_at.startsWith(monthStr)).length,
        total: rows.length,
      };
    }

    // Also compute a combined total for backward compat
    const today = clicks.filter((c) => c.created_at.startsWith(todayStr)).length;
    const month = clicks.filter((c) => c.created_at.startsWith(monthStr)).length;

    return NextResponse.json({ today, month, total: clicks.length, sites });
  } catch {
    return NextResponse.json({ sites: {} });
  }
}
