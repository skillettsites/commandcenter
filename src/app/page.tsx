import DashboardHeader from '@/components/DashboardHeader';
import AllSitesStats from '@/components/AllSitesStats';
import SiteGrid from '@/components/SiteGrid';
import SearchActivity from '@/components/SearchActivity';
import GeoAnalytics from '@/components/GeoAnalytics';
import AffiliateClicks from '@/components/AffiliateClicks';
import BetPositions from '@/components/BetPositions';
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
          <SiteGrid />
          <SearchActivity />
          <GeoAnalytics />
          <AffiliateClicks />
          <BetPositions />
          <EmailList />
          <TaskList />
        </div>
      </PullToRefresh>
    </main>
  );
}
