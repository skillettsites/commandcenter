import { NextResponse } from 'next/server';
import { checkAllSites } from '@/lib/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results = await checkAllSites();
  return NextResponse.json(results);
}
