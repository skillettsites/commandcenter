import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const error = request.nextUrl.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(new URL('/?gmail=error', request.url));
  }

  try {
    await exchangeCode(code);
    return NextResponse.redirect(new URL('/?gmail=connected', request.url));
  } catch (err) {
    console.error('Gmail OAuth error:', err);
    return NextResponse.redirect(new URL('/?gmail=error', request.url));
  }
}
