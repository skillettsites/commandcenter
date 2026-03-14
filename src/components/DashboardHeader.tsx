'use client';

export default function DashboardHeader() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="pt-2 pb-1">
      <p className="text-sm text-[var(--text-secondary)] font-medium">{greeting}</p>
      <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">
        Command Center
      </h1>
    </div>
  );
}
