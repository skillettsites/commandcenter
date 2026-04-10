import GrowthAnalytics from '@/components/GrowthAnalytics';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Growth | Dashboard',
};

export default function GrowthPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4 pb-24">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Growth</h1>
        </div>
        <GrowthAnalytics startExpanded />
      </div>
    </main>
  );
}
