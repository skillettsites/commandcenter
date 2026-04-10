import DashboardHeader from '@/components/DashboardHeader';
import AllSitesStats from '@/components/AllSitesStats';
import GrowthAnalytics from '@/components/GrowthAnalytics';
import SiteGrid from '@/components/SiteGrid';
import SearchActivity from '@/components/SearchActivity';
import GeoAnalytics from '@/components/GeoAnalytics';
import AutoResearch from '@/components/AutoResearch';
import AffiliateClicks from '@/components/AffiliateClicks';
import ChecklistDownloads from '@/components/ChecklistDownloads';
import BetPositions from '@/components/BetPositions';
import MatchMySkillsetStats from '@/components/MatchMySkillsetStats';
import StripeRevenue from '@/components/StripeRevenue';
import EmailList from '@/components/EmailList';
import TaskList from '@/components/TaskList';
import PullToRefresh from '@/components/PullToRefresh';
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <PullToRefresh>
        <div className="max-w-2xl mx-auto px-3 py-4 space-y-4 pb-24">
          <DashboardHeader />
          <AllSitesStats />
          <GrowthAnalytics />
          <StripeRevenue />
          <SiteGrid />
          <TaskList />
          <MatchMySkillsetStats />
          <SearchActivity />
          <GeoAnalytics />
          <AutoResearch />
          <ChecklistDownloads />
          <AffiliateClicks />
          <BetPositions />
          <EmailList />
        </div>
      </PullToRefresh>
    </main>
  );
}
