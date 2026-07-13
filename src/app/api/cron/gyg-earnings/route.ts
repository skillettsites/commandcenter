import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/telegram';
import { updateGygEarnings } from '@/lib/gyg-earnings';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Backfill: /api/cron/gyg-earnings?backfill=1 (scans all history, no Telegram).
// Daily incremental also runs piggybacked in /api/cron/daily-revenue.
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const backfill = new URL(request.url).searchParams.get('backfill') === '1';
  const result = await updateGygEarnings({ backfill, notify: !backfill });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
