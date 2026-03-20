import { Project } from './types';

export const projects: Project[] = [
  { id: 'personal', name: 'Personal', url: '', color: '#EF4444' },
  { id: 'carcostcheck', name: 'CarCostCheck', url: 'https://carcostcheck.co.uk', color: '#3B82F6', gaPropertyId: '527762233', gscSiteUrl: 'sc-domain:carcostcheck.co.uk', bingSiteUrl: 'https://carcostcheck.co.uk/' },
  { id: 'postcodecheck', name: 'PostcodeCheck', url: 'https://postcodecheck.co.uk', color: '#10B981', gaPropertyId: '527604139', gscSiteUrl: 'sc-domain:postcodecheck.co.uk', bingSiteUrl: 'https://postcodecheck.co.uk/' },
  { id: 'tapwaterscore', name: 'TapWaterScore', url: 'https://tapwaterscore.vercel.app', color: '#06B6D4', gaPropertyId: '528464841' },
  { id: 'medcostcheck', name: 'MedCostCheck', url: 'https://medcostcheck.vercel.app', color: '#8B5CF6', gaPropertyId: '528436588' },
  { id: 'findyourstay', name: 'FindYourStay', url: 'https://findyourstay.com', color: '#F59E0B', gaPropertyId: '528486093', gscSiteUrl: 'sc-domain:findyourstay.com' },
  { id: 'helpafterloss', name: 'HelpAfterLoss', url: 'https://helpafterloss.co.uk', color: '#EC4899', gaPropertyId: '528390174', gscSiteUrl: 'https://helpafterloss.co.uk/', bingSiteUrl: 'https://helpafterloss.co.uk/' },
  { id: 'helpafterlife', name: 'HelpAfterLife', url: 'https://helpafterlife.com', color: '#D946EF', gscSiteUrl: 'sc-domain:helpafterlife.com', bingSiteUrl: 'https://helpafterlife.com/' },
  { id: 'aibetfinder', name: 'AI Bet Finder', url: 'https://aibetfinder.com', color: '#F43F5E', gscSiteUrl: 'sc-domain:aibetfinder.com' },
  { id: 'bestlondontours', name: 'BestLondonTours', url: 'https://bestlondontours.co.uk', color: '#E11D48', gscSiteUrl: 'sc-domain:bestlondontours.co.uk', bingSiteUrl: 'https://bestlondontours.co.uk/' },
  { id: 'davidskillett', name: 'DavidSkillett', url: 'https://davidskillett.com', color: '#6366F1', gaPropertyId: '528477374', gscSiteUrl: 'sc-domain:davidskillett.com' },
  { id: 'thebesttours', name: 'TheBestTours', url: 'https://the-best-tours.com', color: '#14B8A6' },
  { id: 'daveknowsai', name: 'DaveKnowsAI', url: 'https://daveknowsai.com', color: '#A855F7' },
  { id: 'dashboard', name: 'Dashboard', url: 'https://commandcenter-mocha.vercel.app', color: '#F97316' },
  { id: 'general', name: 'General', url: '', color: '#6B7280' },
];

export function getProject(id: string): Project | undefined {
  return projects.find(p => p.id === id);
}
