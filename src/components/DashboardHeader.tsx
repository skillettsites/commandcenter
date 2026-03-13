'use client';

export default function DashboardHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-white">Command Center</h1>
        <p className="text-xs text-gray-500">Tasks, ideas, and site status</p>
      </div>
      <div className="text-xs text-gray-600">
        {new Date().toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })}
      </div>
    </div>
  );
}
