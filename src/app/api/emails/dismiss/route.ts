import { NextRequest, NextResponse } from 'next/server';
import { modifyEmailLabels } from '@/lib/gmail';

export async function POST(req: NextRequest) {
  const { emailId, undo } = await req.json();

  if (!emailId) {
    return NextResponse.json({ error: 'emailId required' }, { status: 400 });
  }

  const success = undo
    ? await modifyEmailLabels(emailId, ['IMPORTANT'], [])
    : await modifyEmailLabels(emailId, [], ['IMPORTANT']);

  if (!success) {
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
