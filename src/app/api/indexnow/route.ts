import { NextRequest, NextResponse } from 'next/server';
import { projects } from '@/lib/projects';

export const dynamic = 'force-dynamic';

/**
 * POST /api/indexnow
 * Submit URLs to Bing's IndexNow API for instant indexing.
 *
 * Body: { siteId: string, urls: string[] }
 *
 * Requires INDEXNOW_KEY env var. Each site must host a key file at
 * {siteUrl}/{INDEXNOW_KEY}.txt containing the key value.
 */
export async function POST(request: NextRequest) {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'INDEXNOW_KEY not configured' },
      { status: 503 }
    );
  }

  let body: { siteId?: string; urls?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { siteId, urls } = body;

  if (!siteId || !urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json(
      { error: 'Required: siteId (string) and urls (non-empty array)' },
      { status: 400 }
    );
  }

  const project = projects.find(p => p.id === siteId);
  if (!project) {
    return NextResponse.json({ error: `Unknown siteId: ${siteId}` }, { status: 404 });
  }

  // IndexNow accepts up to 10,000 URLs per request
  const host = new URL(project.url).host;
  const keyLocation = `${project.url}/${key}.txt`;

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        keyLocation,
        urlList: urls.slice(0, 10000),
      }),
    });

    // IndexNow returns 200, 202 (accepted), or 204 (no content) on success
    if (res.ok || res.status === 202) {
      return NextResponse.json({
        status: 'submitted',
        urlCount: urls.length,
        siteId,
        host,
      });
    }

    const errText = await res.text();
    return NextResponse.json(
      {
        status: 'error',
        httpStatus: res.status,
        detail: errText.slice(0, 500),
      },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'IndexNow request failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
