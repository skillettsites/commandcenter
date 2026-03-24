import { Project } from './types';

export const projects: Project[] = [
  { id: 'personal', name: 'Personal', url: '', color: '#EF4444' },
  { id: 'carcostcheck', name: 'CarCostCheck', url: 'https://carcostcheck.co.uk', color: '#3B82F6', gaPropertyId: '527762233', gscSiteUrl: 'sc-domain:carcostcheck.co.uk', bingSiteUrl: 'https://carcostcheck.co.uk/' },
  { id: 'postcodecheck', name: 'PostcodeCheck', url: 'https://postcodecheck.co.uk', color: '#10B981', gaPropertyId: '527604139', gscSiteUrl: 'sc-domain:postcodecheck.co.uk', bingSiteUrl: 'https://postcodecheck.co.uk/' },
  { id: 'tapwaterscore', name: 'TapWaterScore', url: 'https://tapwaterscore.vercel.app', color: '#06B6D4', gaPropertyId: '528464841' },
  { id: 'medcostcheck', name: 'MedCostCheck', url: 'https://medcostcheck.vercel.app', color: '#8B5CF6', gaPropertyId: '528436588' },
  { id: 'findyourstay', name: 'FindYourStay', url: 'https://findyourstay.com', color: '#F59E0B', gaPropertyId: '528486093', gscSiteUrl: 'sc-domain:findyourstay.com', bingSiteUrl: 'https://findyourstay.com/' },
  { id: 'helpafterloss', name: 'HelpAfterLoss', url: 'https://helpafterloss.co.uk', color: '#EC4899', gaPropertyId: '529337369', gscSiteUrl: 'sc-domain:helpafterloss.co.uk', bingSiteUrl: 'https://helpafterloss.co.uk/' },
  { id: 'helpafterlife', name: 'HelpAfterLife', url: 'https://helpafterlife.com', color: '#D946EF', gaPropertyId: '529258409', gscSiteUrl: 'sc-domain:helpafterlife.com', bingSiteUrl: 'https://helpafterlife.com/' },
  { id: 'aibetfinder', name: 'AI Bet Finder', url: 'https://aibetfinder.com', color: '#F43F5E', gaPropertyId: '529262064', gscSiteUrl: 'sc-domain:aibetfinder.com', bingSiteUrl: 'https://aibetfinder.com/' },
  { id: 'bestlondontours', name: 'BestLondonTours', url: 'https://bestlondontours.co.uk', color: '#E11D48', gaPropertyId: '529342008', gscSiteUrl: 'sc-domain:bestlondontours.co.uk', bingSiteUrl: 'https://bestlondontours.co.uk/' },
  { id: 'davidskillett', name: 'DavidSkillett', url: 'https://davidskillett.com', color: '#6366F1', gaPropertyId: '528477374', gscSiteUrl: 'sc-domain:davidskillett.com', bingSiteUrl: 'https://davidskillett.com/' },
  { id: 'thebesttours', name: 'TheBestTours', url: 'https://the-best-tours.com', color: '#14B8A6', gaPropertyId: '529328645', gscSiteUrl: 'sc-domain:the-best-tours.com', bingSiteUrl: 'https://the-best-tours.com/' },
  { id: 'daveknowsai', name: 'DaveKnowsAI', url: 'https://daveknowsai.com', color: '#A855F7', gaPropertyId: '529258215', gscSiteUrl: 'sc-domain:daveknowsai.com', bingSiteUrl: 'https://daveknowsai.com/' },
  { id: 'askyourstay', name: 'AskYourStay', url: 'https://askyourstay.com', color: '#0EA5E9', gaPropertyId: '529406812', gscSiteUrl: 'sc-domain:askyourstay.com', bingSiteUrl: 'https://askyourstay.com/' },
  { id: 'aicareerswap', name: 'AICareerSwap', url: 'https://aicareerswap.com', color: '#F472B6', gaPropertyId: '529412747', gscSiteUrl: 'sc-domain:aicareerswap.com', bingSiteUrl: 'https://aicareerswap.com/' },
  { id: 'briefmynews', name: 'BriefMyNews', url: 'https://briefmynews.com', color: '#DC2626', gaPropertyId: '52972611', gscSiteUrl: 'sc-domain:briefmynews.com', bingSiteUrl: 'https://briefmynews.com/' },
  { id: 'dashboard', name: 'Dashboard', url: 'https://commandcenter-mocha.vercel.app', color: '#F97316' },
  { id: 'general', name: 'General', url: '', color: '#6B7280' },
];

export function getProject(id: string): Project | undefined {
  return projects.find(p => p.id === id);
}
