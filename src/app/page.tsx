import HeroStats from '@/components/HeroStats';
import RevenueBoard from '@/components/RevenueBoard';
import UsersBoard from '@/components/UsersBoard';
import SitesGraph from '@/components/SitesGraph';
import SearchesBoard from '@/components/SearchesBoard';
import GeoAnalytics from '@/components/GeoAnalytics';
import AutoResearch from '@/components/AutoResearch';
import AffiliateClicks from '@/components/AffiliateClicks';
import ChecklistDownloads from '@/components/ChecklistDownloads';
import BetPositions from '@/components/BetPositions';
import MatchMySkillsetStats from '@/components/MatchMySkillsetStats';
import EmailList from '@/components/EmailList';
import TaskList from '@/components/TaskList';
import PullToRefresh from '@/components/PullToRefresh';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <PullToRefresh>
      <div className="space-y-5 lg:space-y-6">
        {/* Hero KPIs */}
        <HeroStats />

        {/* Money + audience */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
          <div className="lg:col-span-7">
            <RevenueBoard />
          </div>
          <div className="lg:col-span-5">
            <UsersBoard />
          </div>
        </div>

        {/* Sites network */}
        <SitesGraph />

        {/* Demand */}
        <SearchesBoard />

        {/* Operations: growth ops, geography, tasks, inbox */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
          <div className="lg:col-span-8 space-y-5">
            <GeoAnalytics />
            <AutoResearch />
            <AffiliateClicks />
            <ChecklistDownloads />
          </div>
          <div className="lg:col-span-4 space-y-5">
            <TaskList />
            <MatchMySkillsetStats />
            <BetPositions />
            <EmailList />
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
