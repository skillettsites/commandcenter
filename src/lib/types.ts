export interface Task {
  id: string;
  project: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  completed_at: string | null;
  notes: string | null;
}

export interface Project {
  id: string;
  name: string;
  url: string;
  color: string;
}

export interface HealthResult {
  siteId: string;
  url: string;
  status: 'up' | 'slow' | 'down';
  responseTime: number | null;
  statusCode: number | null;
}

export interface SyncPayload {
  project: string;
  todos: { description: string; status: 'pending' | 'done' }[];
}
