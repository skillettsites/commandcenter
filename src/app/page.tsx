import DashboardHeader from '@/components/DashboardHeader';
import SiteGrid from '@/components/SiteGrid';
import BetPositions from '@/components/BetPositions';
import EmailList from '@/components/EmailList';
import TaskList from '@/components/TaskList';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4 pb-24">
        <DashboardHeader />
        <SiteGrid />
        <BetPositions />
        <EmailList />
        <TaskList />
      </div>
    </main>
  );
}
