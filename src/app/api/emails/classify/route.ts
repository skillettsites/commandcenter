import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { modifyEmailLabels } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

type Classification = 'important' | 'noise';

const SCORE_DELTA: Record<Classification, number> = {
  important: 3,
  noise: -3,
};

// Auto-classify thresholds
const IMPORTANT_THRESHOLD = 5;
const NOISE_THRESHOLD = -5;

/**
 * POST /api/emails/classify
 *
 * Classifies an email and updates the sender's reputation score.
 * Body: { emailId, senderEmail, senderName, classification, undo? }
 *
 * The scoring system learns from every action:
 * - "important" = +3 to sender score
 * - "noise" = -3 to sender score
 * - Once a sender hits +5 or -5, future emails are auto-classified
 *
 * Also applies Gmail label modifications:
 * - "noise" = archive (remove INBOX) + mark read
 * - "important" = mark as starred
 */
export async function POST(req: NextRequest) {
  const { emailId, senderEmail, senderName, classification, undo } = await req.json();

  if (!senderEmail || !classification) {
    return NextResponse.json(
      { error: 'senderEmail and classification required' },
      { status: 400 }
    );
  }

  const validClassifications: Classification[] = ['important', 'noise'];
  if (!validClassifications.includes(classification)) {
    return NextResponse.json(
      { error: 'classification must be "important" or "noise"' },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();
  const domain = senderEmail.split('@')[1] || '';
  const delta = undo ? -SCORE_DELTA[classification as Classification] : SCORE_DELTA[classification as Classification];

  // Upsert sender score
  const { data: existing } = await supabase
    .from('sender_scores')
    .select('*')
    .eq('sender_email', senderEmail.toLowerCase())
    .single();

  const now = new Date().toISOString();

  if (existing) {
    const newScore = (existing.score || 0) + delta;
    const newTotal = (existing.total_actions || 0) + (undo ? -1 : 1);

    // Determine auto-classification based on cumulative score
    let autoClassify: string | null = null;
    if (newScore >= IMPORTANT_THRESHOLD) autoClassify = 'important';
    else if (newScore <= NOISE_THRESHOLD) autoClassify = 'noise';

    await supabase
      .from('sender_scores')
      .update({
        score: newScore,
        total_actions: Math.max(0, newTotal),
        classification: autoClassify,
        last_action: undo ? null : classification,
        last_action_at: now,
        sender_name: senderName || existing.sender_name,
        updated_at: now,
      })
      .eq('sender_email', senderEmail.toLowerCase());
  } else if (!undo) {
    // New sender
    const score = delta;
    let autoClassify: string | null = null;
    if (score >= IMPORTANT_THRESHOLD) autoClassify = 'important';
    else if (score <= NOISE_THRESHOLD) autoClassify = 'noise';

    await supabase
      .from('sender_scores')
      .insert({
        sender_email: senderEmail.toLowerCase(),
        sender_domain: domain.toLowerCase(),
        sender_name: senderName || null,
        score,
        total_actions: 1,
        classification: autoClassify,
        last_action: classification,
        last_action_at: now,
        created_at: now,
        updated_at: now,
      });
  }

  // Apply Gmail actions (non-blocking, best effort)
  if (!undo && emailId) {
    try {
      if (classification === 'noise') {
        // Archive + mark read
        await modifyEmailLabels(emailId, [], ['INBOX', 'UNREAD']);
      } else if (classification === 'important') {
        // Star the email
        await modifyEmailLabels(emailId, ['STARRED'], []);
      }
    } catch {
      // Gmail action failed, but scoring still saved
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/emails/classify
 *
 * Returns all sender scores for the UI to use for sorting/filtering.
 */
export async function GET() {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('sender_scores')
    .select('sender_email, sender_domain, sender_name, score, classification, total_actions')
    .order('score', { ascending: false });

  if (error) {
    return NextResponse.json({ scores: [] });
  }

  return NextResponse.json({ scores: data || [] });
}
