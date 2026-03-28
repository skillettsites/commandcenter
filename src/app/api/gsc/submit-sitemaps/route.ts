import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth | null {
  if (_auth) return _auth;
  const email = process.env.GA_CLIENT_EMAIL;
  const key = process.env.GA_PRIVATE_KEY;
  if (!email || !key) return null;
  _auth = new GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  });
  return _auth;
}

// POST /api/gsc/submit-sitemaps
// Submits sitemaps to Google Search Console for all configured sites
export async function POST() {
  const auth = getAuth();
  if (!auth) {
    return NextResponse.json({ error: 'GSC credentials not configured' }, { status: 503 });
  }

  const gscSites = projects.filter(p => p.gscSiteUrl);
  const results: Array<{ siteId: string; siteUrl: string; sitemapUrl: string; status: string; error?: string }> = [];

  try {
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const headers = {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    };

    for (const project of gscSites) {
      const encodedSiteUrl = encodeURIComponent(project.gscSiteUrl!);
      const sitemapUrl = `${project.url}/sitemap.xml`;
      const encodedSitemapUrl = encodeURIComponent(sitemapUrl);

      try {
        const res = await fetch(
          `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps/${encodedSitemapUrl}`,
          { method: 'PUT', headers }
        );

        if (res.ok || res.status === 204) {
          results.push({
            siteId: project.id,
            siteUrl: project.gscSiteUrl!,
            sitemapUrl,
            status: 'submitted',
          });
        } else {
          const errBody = await res.text();
          results.push({
            siteId: project.id,
            siteUrl: project.gscSiteUrl!,
            sitemapUrl,
            status: 'error',
            error: `${res.status}: ${errBody.slice(0, 200)}`,
          });
        }
      } catch (err) {
        results.push({
          siteId: project.id,
          siteUrl: project.gscSiteUrl!,
          sitemapUrl,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: 'Auth failed', detail: String(err) }, { status: 500 });
  }

  const submitted = results.filter(r => r.status === 'submitted').length;
  const failed = results.filter(r => r.status === 'error').length;

  return NextResponse.json({ total: results.length, submitted, failed, results });
}

// GET handler for convenience
export async function GET() {
  return POST();
}
