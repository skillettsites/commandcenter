import Finances from '@/components/Finances';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Finances | Dashboard',
};

export default function FinancesPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <div className="max-w-2xl mx-auto px-3 py-4 space-y-4 pb-24">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Finances</h1>
        </div>
        <Finances startExpanded />
      </div>
    </main>
  );
}
