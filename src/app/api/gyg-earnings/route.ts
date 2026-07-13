import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Dashboard data: GYG affiliate earnings (pending estimate vs confirmed/paid).
export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data: pend } = await supabase.from('gyg_bookings').select('commission_gbp').eq('status', 'pending');
    const { data: paid } = await supabase.from('gyg_payouts').select('amount_gbp,period,payout_date').order('payout_date', { ascending: false });
    const pendingGbp = +(pend || []).reduce((s: number, r: { commission_gbp: number }) => s + (r.commission_gbp || 0), 0).toFixed(2);
    const paidGbp = +(paid || []).reduce((s: number, r: { amount_gbp: number }) => s + (r.amount_gbp || 0), 0).toFixed(2);
    return NextResponse.json({
      pendingGbp,
      paidGbp,
      bookings: (pend || []).length,
      payouts: paid || [],
    });
  } catch {
    return NextResponse.json({ pendingGbp: 0, paidGbp: 0, bookings: 0, payouts: [] });
  }
}
