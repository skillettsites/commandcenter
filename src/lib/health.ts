import { HealthResult } from './types';
import { projects } from './projects';

export async function checkHealth(url: string): Promise<{ status: 'up' | 'slow' | 'down'; responseTime: number | null; statusCode: number | null }> {
  if (!url) return { status: 'down', responseTime: null, statusCode: null };

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    const responseTime = Date.now() - start;
    const status = responseTime >= 3000 ? 'slow' : 'up';
    return { status, responseTime, statusCode: res.status };
  } catch {
    return { status: 'down', responseTime: null, statusCode: null };
  }
}

export async function checkAllSites(): Promise<HealthResult[]> {
  const checks = projects
    .filter(p => p.url)
    .map(async (p) => {
      const result = await checkHealth(p.url);
      return { siteId: p.id, url: p.url, ...result };
    });
  return Promise.all(checks);
}
