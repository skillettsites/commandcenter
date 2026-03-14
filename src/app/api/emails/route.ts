import { NextResponse } from 'next/server';
import { getImportantEmails } from '@/lib/gmail';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getImportantEmails(10);

  if (result.emails.length > 0) {
    const supabase = getServiceClient();
    const { data: dismissed } = await supabase
      .from('dismissed_emails')
      .select('email_id');

    if (dismissed && dismissed.length > 0) {
      const dismissedIds = new Set(dismissed.map((d: { email_id: string }) => d.email_id));
      result.emails = result.emails.filter(e => !dismissedIds.has(e.id));
    }
  }

  return NextResponse.json(result);
}
