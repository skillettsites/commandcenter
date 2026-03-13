import { Project } from './types';

export const projects: Project[] = [
  { id: 'carcostcheck', name: 'CarCostCheck', url: 'https://carcostcheck.co.uk', color: '#3B82F6' },
  { id: 'postcodecheck', name: 'PostcodeCheck', url: 'https://postcodecheck.co.uk', color: '#10B981' },
  { id: 'tapwaterscore', name: 'TapWaterScore', url: 'https://tapwaterscore.vercel.app', color: '#06B6D4' },
  { id: 'medcostcheck', name: 'MedCostCheck', url: 'https://medcostcheck.vercel.app', color: '#8B5CF6' },
  { id: 'findyourstay', name: 'FindYourStay', url: 'https://findyourstay.com', color: '#F59E0B' },
  { id: 'helpafterloss', name: 'HelpAfterLoss', url: 'https://helpafterloss.co.uk', color: '#EC4899' },
  { id: 'davidskillett', name: 'DavidSkillett', url: 'https://davidskillett.com', color: '#6366F1' },
  { id: 'general', name: 'General', url: '', color: '#6B7280' },
];

export function getProject(id: string): Project | undefined {
  return projects.find(p => p.id === id);
}
