import { NextResponse } from 'next/server';
import { getEmailBody } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Email ID required' }, { status: 400 });
  }

  const result = await getEmailBody(id);
  if (!result) {
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 });
  }

  return NextResponse.json(result);
}
