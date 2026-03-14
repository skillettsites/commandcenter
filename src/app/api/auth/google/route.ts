import { NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/gmail';

export async function GET() {
  const url = getGoogleAuthUrl();
  return NextResponse.redirect(url);
}
