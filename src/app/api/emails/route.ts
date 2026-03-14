import { NextResponse } from 'next/server';
import { getImportantEmails } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getImportantEmails(10);
  return NextResponse.json(result);
}
