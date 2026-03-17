import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const { emailId, senderEmail, undo } = await req.json();

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

    // Undo the -1 score penalty if sender was provided
    if (senderEmail) {
      const { data: existing } = await supabase
        .from('sender_scores')
        .select('score, total_actions')
        .eq('sender_email', senderEmail.toLowerCase())
        .single();

      if (existing) {
        await supabase
          .from('sender_scores')
          .update({
            score: (existing.score || 0) + 1,
            total_actions: Math.max(0, (existing.total_actions || 0) - 1),
            updated_at: new Date().toISOString(),
          })
          .eq('sender_email', senderEmail.toLowerCase());
      }
    }
  } else {
    const { error } = await supabase
      .from('dismissed_emails')
      .upsert({ email_id: emailId, dismissed_at: new Date().toISOString() });
    if (error) {
      return NextResponse.json({ error: 'Failed to dismiss email' }, { status: 500 });
    }

    // Give sender a small -1 penalty for dismiss (softer than "noise" which is -3)
    if (senderEmail) {
      const domain = senderEmail.split('@')[1] || '';
      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from('sender_scores')
        .select('score, total_actions')
        .eq('sender_email', senderEmail.toLowerCase())
        .single();

      if (existing) {
        const newScore = (existing.score || 0) - 1;
        await supabase
          .from('sender_scores')
          .update({
            score: newScore,
            total_actions: (existing.total_actions || 0) + 1,
            classification: newScore <= -5 ? 'noise' : null,
            last_action: 'dismiss',
            last_action_at: now,
            updated_at: now,
          })
          .eq('sender_email', senderEmail.toLowerCase());
      } else {
        await supabase
          .from('sender_scores')
          .insert({
            sender_email: senderEmail.toLowerCase(),
            sender_domain: domain.toLowerCase(),
            score: -1,
            total_actions: 1,
            last_action: 'dismiss',
            last_action_at: now,
            created_at: now,
            updated_at: now,
          });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
