import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

interface ClickRow {
  id: number;
  type: string;
  city: string;
  section: string;
  site: string;
  url: string;
  created_at: string;
  geo_city: string | null;
  geo_region: string | null;
  geo_country: string | null;
}

interface SiteStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

async function fetchClicks(extraParams = ""): Promise<ClickRow[]> {
  const url = `${SUPABASE_URL}/rest/v1/affiliate_clicks?order=created_at.desc&select=id,type,city,section,site,url,created_at,geo_city,geo_region,geo_country${extraParams}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    next: { revalidate: 30 },
  });
  if (!res.ok) return [];
  return res.json();
}

export async function GET(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ sites: {} });
  }

  const mode = req.nextUrl.searchParams.get("mode");

  try {
    // Full mode returns everything the dashboard needs
    if (mode === "full") {
      const clicks = await fetchClicks("&limit=10000");
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const monthStr = now.toISOString().slice(0, 7);

      // Week start (Monday)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - mondayOffset);
      weekStart.setHours(0, 0, 0, 0);

      const isThisWeek = (dateStr: string) => new Date(dateStr) >= weekStart;

      // Recent clicks (last 20)
      const recent = clicks.slice(0, 20).map((c) => ({
        id: c.id,
        time: c.created_at,
        site: c.site,
        type: c.type,
        section: c.section,
        city: c.city,
        geo_city: c.geo_city,
        geo_country: c.geo_country,
      }));

      // Stats
      const today = clicks.filter((c) => c.created_at.startsWith(todayStr)).length;
      const week = clicks.filter((c) => isThisWeek(c.created_at)).length;
      const month = clicks.filter((c) => c.created_at.startsWith(monthStr)).length;
      const total = clicks.length;

      // By site
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
          week: rows.filter((c) => isThisWeek(c.created_at)).length,
          month: rows.filter((c) => c.created_at.startsWith(monthStr)).length,
          total: rows.length,
        };
      }

      // By type
      const byType: Record<string, SiteStats> = {};
      const types = [...new Set(clicks.map((c) => c.type))];
      for (const type of types) {
        const typeClicks = clicks.filter((c) => c.type === type);
        byType[type] = {
          today: typeClicks.filter((c) => c.created_at.startsWith(todayStr)).length,
          week: typeClicks.filter((c) => isThisWeek(c.created_at)).length,
          month: typeClicks.filter((c) => c.created_at.startsWith(monthStr)).length,
          total: typeClicks.length,
        };
      }

      // Top cities (by click count)
      const cityCount: Record<string, number> = {};
      for (const c of clicks) {
        const city = c.city || "unknown";
        cityCount[city] = (cityCount[city] || 0) + 1;
      }
      const topCities = Object.entries(cityCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([city, count]) => ({ city, count }));

      // Top sections
      const sectionCount: Record<string, number> = {};
      for (const c of clicks) {
        const section = c.section || "unknown";
        sectionCount[section] = (sectionCount[section] || 0) + 1;
      }
      const topSections = Object.entries(sectionCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([section, count]) => ({ section, count }));

      // Top geo cities (user location, not page city)
      const geoCityCount: Record<string, number> = {};
      for (const c of clicks) {
        const geo = c.geo_city || "unknown";
        geoCityCount[geo] = (geoCityCount[geo] || 0) + 1;
      }
      const topGeoCities = Object.entries(geoCityCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([city, count]) => ({ city, count }));

      return NextResponse.json({
        today,
        week,
        month,
        total,
        recent,
        sites,
        byType,
        topCities,
        topSections,
        topGeoCities,
      });
    }

    // Default mode: backward compatible simple stats
    const siteFilter = req.nextUrl.searchParams.get("site");
    let extraParams = "&limit=10000";
    if (siteFilter) {
      extraParams += `&site=eq.${siteFilter}`;
    }
    const clicks = await fetchClicks(extraParams);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    const siteMap: Record<string, ClickRow[]> = {};
    for (const c of clicks) {
      const s = c.site || "unknown";
      if (!siteMap[s]) siteMap[s] = [];
      siteMap[s].push(c);
    }

    const sites: Record<string, { today: number; month: number; total: number }> = {};
    for (const [site, rows] of Object.entries(siteMap)) {
      sites[site] = {
        today: rows.filter((c) => c.created_at.startsWith(todayStr)).length,
        month: rows.filter((c) => c.created_at.startsWith(monthStr)).length,
        total: rows.length,
      };
    }

    const today = clicks.filter((c) => c.created_at.startsWith(todayStr)).length;
    const month = clicks.filter((c) => c.created_at.startsWith(monthStr)).length;

    const byType: Record<string, { today: number; month: number; total: number }> = {};
    const types = [...new Set(clicks.map((c) => c.type))];
    for (const type of types) {
      const typeClicks = clicks.filter((c) => c.type === type);
      byType[type] = {
        today: typeClicks.filter((c) => c.created_at.startsWith(todayStr)).length,
        month: typeClicks.filter((c) => c.created_at.startsWith(monthStr)).length,
        total: typeClicks.length,
      };
    }

    return NextResponse.json({ today, month, total: clicks.length, sites, byType });
  } catch {
    return NextResponse.json({ sites: {} });
  }
}
