import GrowthAnalytics from '@/components/GrowthAnalytics';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Growth | Command Center',
};

export default function GrowthPage() {
  return (
    <div className="max-w-[1100px]">
      <GrowthAnalytics startExpanded />
    </div>
  );
}
