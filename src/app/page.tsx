import DashboardHeader from '@/components/DashboardHeader';
import AllSitesStats from '@/components/AllSitesStats';
import SiteGrid from '@/components/SiteGrid';
// import SearchActivity from '@/components/SearchActivity';
import BetPositions from '@/components/BetPositions';
import EmailList from '@/components/EmailList';
import TaskList from '@/components/TaskList';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4 pb-24">
        <DashboardHeader />
        <AllSitesStats />
        <SiteGrid />
        {/* <SearchActivity /> */}
        <BetPositions />
        <EmailList />
        <TaskList />
      </div>
    </main>
  );
}
