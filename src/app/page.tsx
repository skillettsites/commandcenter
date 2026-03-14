import DashboardHeader from '@/components/DashboardHeader';
import SiteGrid from '@/components/SiteGrid';
import EmailList from '@/components/EmailList';
import TaskList from '@/components/TaskList';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24">
        <DashboardHeader />
        <SiteGrid />
        <EmailList />
        <TaskList />
      </div>
    </main>
  );
}
