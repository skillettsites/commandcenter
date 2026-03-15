'use client';

export default function DashboardHeader() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="pt-1 flex items-baseline justify-between">
      <h1 className="text-[24px] font-bold text-white tracking-tight leading-tight">
        Dashboard
      </h1>
      <p className="text-[13px] text-[var(--text-secondary)] font-medium">{greeting}</p>
    </div>
  );
}
