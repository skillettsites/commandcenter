import DashboardHeader from '@/components/DashboardHeader';
import HealthBar from '@/components/HealthBar';
import TaskList from '@/components/TaskList';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <DashboardHeader />
        <HealthBar />
        <TaskList />
      </div>
    </main>
  );
}
