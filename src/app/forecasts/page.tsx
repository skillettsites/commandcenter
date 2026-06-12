import ForecastBoard from '@/components/ForecastBoard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Forecasts | Command Center',
};

export default function ForecastsPage() {
  return (
    <div className="space-y-5">
      <p className="text-[14px] text-[var(--text-secondary)] max-w-2xl">
        Where the numbers are heading: projected net worth, the path to financial independence, and the run-rate of the businesses.
      </p>
      <ForecastBoard />
    </div>
  );
}
