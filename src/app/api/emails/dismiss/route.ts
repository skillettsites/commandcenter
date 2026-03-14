import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { emailId, undo } = await req.json();

  if (!emailId) {
    return NextResponse.json({ error: 'emailId required' }, { status: 400 });
  }

  const supabase = getServiceClient();

  if (undo) {
    const { error } = await supabase
      .from('dismissed_emails')
      .delete()
      .eq('email_id', emailId);
    if (error) {
      return NextResponse.json({ error: 'Failed to undo dismiss' }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from('dismissed_emails')
      .upsert({ email_id: emailId, dismissed_at: new Date().toISOString() });
    if (error) {
      return NextResponse.json({ error: 'Failed to dismiss email' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
