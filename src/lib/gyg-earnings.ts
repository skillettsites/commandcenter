import { getServiceClient } from './supabase';
import { searchEmails, getMessageDetail } from './gmail';
import { sendTelegram } from './telegram';

// GetYourGuide affiliate: each "New booking" email is a PENDING commission (8% of the
// booking price, priced in EUR). Bookings can cancel before travel, so they're only
// an estimate until GYG's monthly PAYOUT confirms/pays the settled amount (in GBP).
// We track bookings (pending) and payouts (confirmed) in two tables.

const COMMISSION_RATE = 0.08;
const BOOKING_QUERY = 'from:notification.getyourguide.com subject:"New booking on GetYourGuide"';
const PAYOUT_QUERY = '(from:notification.getyourguide.com "Your payment is confirmed") OR (from:paypal "GetYourGuide Payout")';

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&pound;/g, '£')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fxToGbp(currency: string): Promise<number> {
  if (currency === 'GBP') return 1;
  try {
    const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${currency}&symbols=GBP`);
    const d = await r.json();
    return d?.rates?.GBP || (currency === 'EUR' ? 0.86 : 1);
  } catch {
    return currency === 'EUR' ? 0.86 : 1;
  }
}

function parseBooking(text: string) {
  const price = text.match(/Price:\s*([\d.,]+)\s*([A-Z]{3})/i);
  if (!price) return null;
  const product = text.match(/GetYourGuide product:\s*(.+?)\s+(?:Print|Date:)/i);
  const date = text.match(/Date:\s*(\d{2})-(\d{2})-(\d{4})/);
  return {
    price: parseFloat(price[1].replace(/,/g, '')),
    currency: price[2].toUpperCase(),
    product: (product?.[1] || '').trim().slice(0, 200),
    bookingDate: date ? `${date[3]}-${date[2]}-${date[1]}` : null,
  };
}

function parsePayout(text: string) {
  const amt = text.match(/Amount\s+([\d.,]+)\s+GBP/i) || text.match(/sent you\s+£?([\d.,]+)\s*GBP/i);
  if (!amt) return null;
  const ref = text.match(/Reference ID\s+([A-Z0-9-]+)/i);
  const period = text.match(/Period\s+([\d]{2}\s+\w+\s+\d{4}\s*-\s*\d{2}\s+\w+\s+\d{4})/i);
  const date = text.match(/Date\s+(\d{1,2}\s+\w+\s+\d{4})/i);
  return {
    amount: parseFloat(amt[1].replace(/,/g, '')),
    reference: ref?.[1] || null,
    period: period?.[1] || null,
    payoutDate: date ? new Date(date[1]).toISOString().slice(0, 10) : null,
  };
}

export interface GygSummary {
  ok: boolean;
  newBookings: number;
  newPayouts: number;
  pendingGbp: number;
  paidGbp: number;
  error?: string;
}

// backfill=true scans all history; otherwise just the last ~2 days (for the daily cron).
export async function updateGygEarnings(opts: { backfill?: boolean; notify?: boolean } = {}): Promise<GygSummary> {
  const supabase = getServiceClient();
  const dateFilter = opts.backfill ? '' : ' newer_than:2d';

  let newBookings = 0;
  let newPayouts = 0;

  try {
    // ---- Bookings (pending) ----
    const bookingIds = await searchEmails(BOOKING_QUERY + dateFilter, opts.backfill ? 2000 : 100);
    const eurGbp = await fxToGbp('EUR');
    const bookingRows: Record<string, unknown>[] = [];
    for (const id of bookingIds) {
      const detail = await getMessageDetail(id);
      if (!detail) continue;
      const b = parseBooking(stripHtml(detail.body));
      if (!b) continue;
      const commission = +(b.price * COMMISSION_RATE).toFixed(2);
      const rate = b.currency === 'EUR' ? eurGbp : await fxToGbp(b.currency);
      bookingRows.push({
        message_id: id,
        product: b.product,
        price: b.price,
        currency: b.currency,
        commission,
        commission_gbp: +(commission * rate).toFixed(2),
        status: 'pending',
        booking_date: b.bookingDate,
        email_date: new Date().toISOString(),
      });
    }
    if (bookingRows.length) {
      const { error } = await supabase.from('gyg_bookings').upsert(bookingRows, { onConflict: 'message_id', ignoreDuplicates: true });
      if (!error) newBookings = bookingRows.length;
    }

    // ---- Payouts (confirmed) ----
    const payoutIds = await searchEmails(PAYOUT_QUERY + dateFilter, opts.backfill ? 200 : 20);
    const payoutRows: Record<string, unknown>[] = [];
    for (const id of payoutIds) {
      const detail = await getMessageDetail(id);
      if (!detail) continue;
      const p = parsePayout(stripHtml(detail.body));
      if (!p) continue;
      payoutRows.push({
        message_id: id,
        reference: p.reference || id,
        amount_gbp: p.amount,
        period: p.period,
        payout_date: p.payoutDate,
      });
    }
    if (payoutRows.length) {
      const { error } = await supabase.from('gyg_payouts').upsert(payoutRows, { onConflict: 'reference', ignoreDuplicates: true });
      if (!error) newPayouts = payoutRows.length;
    }

    // ---- Totals ----
    const { data: pend } = await supabase.from('gyg_bookings').select('commission_gbp').eq('status', 'pending');
    const { data: paid } = await supabase.from('gyg_payouts').select('amount_gbp');
    const pendingGbp = +(pend || []).reduce((s: number, r: { commission_gbp: number }) => s + (r.commission_gbp || 0), 0).toFixed(2);
    const paidGbp = +(paid || []).reduce((s: number, r: { amount_gbp: number }) => s + (r.amount_gbp || 0), 0).toFixed(2);

    if (opts.notify && (newBookings > 0 || newPayouts > 0)) {
      await sendTelegram(
        `<b>🎟️ GetYourGuide earnings</b>\n${newBookings} new booking${newBookings === 1 ? '' : 's'} today${newPayouts ? `, ${newPayouts} payout` : ''}\n<b>£${pendingGbp.toFixed(2)} pending</b> · <b>£${paidGbp.toFixed(2)} confirmed (paid)</b>\n<i>Bookings are provisional until GYG confirms & pays out.</i>`
      );
    }

    return { ok: true, newBookings, newPayouts, pendingGbp, paidGbp };
  } catch (err) {
    return { ok: false, newBookings, newPayouts, pendingGbp: 0, paidGbp: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
