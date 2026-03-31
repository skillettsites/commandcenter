import { NextResponse } from 'next/server';
import { projects } from '@/lib/projects';
import { ukTodayStr, ukMonthStr } from '@/lib/uk-time';

export const dynamic = 'force-dynamic';

interface VercelOverview {
  total: number;   // pageviews
  devices: number; // unique visitors
  bounceRate: number;
}

interface VercelSiteStats {
  siteId: string;
  today: { pageViews: number; visitors: number };
  month: { pageViews: number; visitors: number };
  allTime: { pageViews: number; visitors: number };
  enabled: boolean;
}

async function fetchOverview(
  projectId: string,
  from: string,
  to: string,
  token: string,
  teamId: string,
): Promise<VercelOverview | null> {
  try {
    const url = `https://vercel.com/api/web-analytics/overview?projectId=${projectId}&teamId=${teamId}&from=${from}&to=${to}&environment=production`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    return data as VercelOverview;
  } catch {
    return null;
  }
}

export async function GET() {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;

  if (!token || !teamId) {
    return NextResponse.json({ error: 'Vercel API credentials not configured', data: [] });
  }

  const vercelProjects = projects.filter(p => p.vercelProjectId);
  const today = ukTodayStr();
  const monthStart = ukMonthStr() + '-01';
  // All-time: from Jan 2025 (before any site existed)
  const allTimeStart = '2025-01-01';

  const results: VercelSiteStats[] = await Promise.all(
    vercelProjects.map(async (project) => {
      const pid = project.vercelProjectId!;

      const [todayData, monthData, allTimeData] = await Promise.all([
        fetchOverview(pid, today, today, token, teamId),
        fetchOverview(pid, monthStart, today, token, teamId),
        fetchOverview(pid, allTimeStart, today, token, teamId),
      ]);

      return {
        siteId: project.id,
        today: {
          pageViews: todayData?.total ?? 0,
          visitors: todayData?.devices ?? 0,
        },
        month: {
          pageViews: monthData?.total ?? 0,
          visitors: monthData?.devices ?? 0,
        },
        allTime: {
          pageViews: allTimeData?.total ?? 0,
          visitors: allTimeData?.devices ?? 0,
        },
        enabled: todayData !== null || monthData !== null || allTimeData !== null,
      };
    })
  );

  return NextResponse.json({ data: results });
}
