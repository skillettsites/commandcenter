import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/telegram';
import { checkAmazonInvites } from '@/lib/amazon-invite';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Manual/on-demand Amazon invitation-to-buy check.
// The automatic daily run is piggybacked onto /api/cron/daily-revenue to stay
// within the Vercel Hobby cron limits. Hit this route with ?dry=1 to preview
// without sending a Telegram message.
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const result = await checkAmazonInvites({ dryRun });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
