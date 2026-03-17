import { NextResponse } from 'next/server';
import { getImportantEmails } from '@/lib/gmail';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface SenderScore {
  sender_email: string;
  score: number;
  classification: string | null;
}

export async function GET() {
  const result = await getImportantEmails(25);

  if (result.emails.length > 0) {
    const supabase = getServiceClient();

    // Fetch dismissed emails and sender scores in parallel
    const [dismissedRes, scoresRes] = await Promise.all([
      supabase.from('dismissed_emails').select('email_id'),
      supabase.from('sender_scores').select('sender_email, score, classification'),
    ]);

    const dismissed = dismissedRes.data;
    const scores = (scoresRes.data || []) as SenderScore[];

    // Build lookup maps
    const dismissedIds = new Set(
      (dismissed || []).map((d: { email_id: string }) => d.email_id)
    );
    const scoreMap = new Map(
      scores.map(s => [s.sender_email, s])
    );

    // Filter out dismissed emails and noise senders
    result.emails = result.emails.filter(e => {
      if (dismissedIds.has(e.id)) return false;

      // Extract raw email from "Name <email>" format
      const emailMatch = e.from.match(/<([^>]+)>/) || [null, e.from];
      const senderEmail = (emailMatch[1] || e.from).toLowerCase().trim();
      const senderScore = scoreMap.get(senderEmail);

      // Auto-hide emails from senders classified as noise
      if (senderScore?.classification === 'noise') return false;

      return true;
    });

    // Sort: important senders first, then by date (default)
    result.emails.sort((a, b) => {
      const aEmail = (a.from.match(/<([^>]+)>/)?.[1] || a.from).toLowerCase().trim();
      const bEmail = (b.from.match(/<([^>]+)>/)?.[1] || b.from).toLowerCase().trim();
      const aScore = scoreMap.get(aEmail)?.score || 0;
      const bScore = scoreMap.get(bEmail)?.score || 0;

      // Important senders bubble up
      if (aScore !== bScore) return bScore - aScore;
      return 0; // preserve original date order
    });
  }

  return NextResponse.json(result);
}
