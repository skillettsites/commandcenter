import {
  searchEmails,
  getMessageDetail,
  findOrCreateLabel,
  modifyEmailLabels,
  type GmailMessageDetail,
} from './gmail';
import { sendTelegram, escapeHtml } from './telegram';

// Gmail label applied to invites we've already pinged, so we never alert twice.
const ALERT_LABEL = 'AmazonInviteAlerted';

// Candidate query: Amazon mail from the last 30 days that looks like a buy invite,
// excluding the "Invitation request received" acknowledgements and anything already alerted.
const QUERY = [
  '(from:amazon.co.uk OR from:amazon.com)',
  'newer_than:30d',
  '-subject:"Invitation request received"',
  `-label:${ALERT_LABEL}`,
  '(subject:invitation OR subject:invited OR "invited to buy" OR "invitation to purchase" OR "you can now buy" OR "you\'re invited to buy" OR "complete your purchase")',
].join(' ');

// Phrases that confirm this is a genuine invitation-to-buy (not a request confirmation).
const POSITIVE = [
  /invited to (buy|purchase)/i,
  /invitation to (buy|purchase)/i,
  /you('?re| are) invited to buy/i,
  /you can now (buy|purchase)/i,
  /buy it now/i,
  /complete your (purchase|order)/i,
  /72[\s-]?hour/i,
];

// Subjects that mean "we got your request" rather than "you may now buy".
const NEGATIVE = [
  /invitation request received/i,
  /we('?ve| have) received your.*request/i,
];

export interface InviteItem {
  id: string;
  subject: string;
}

export interface InviteResult {
  ok: boolean;
  candidates: number;
  alerted: number;
  items: InviteItem[];
  query: string;
  dryRun: boolean;
  error?: string;
}

function extractProductUrl(body: string): string | null {
  const patterns = [
    /https?:\/\/(?:www\.)?amazon\.co\.uk\/[^\s"'<>]*(?:\/dp\/|\/gp\/(?:product|buy)\/)[^\s"'<>]*/i,
    /https?:\/\/(?:www\.)?amazon\.com\/[^\s"'<>]*(?:\/dp\/|\/gp\/(?:product|buy)\/)[^\s"'<>]*/i,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m) return m[0].replace(/&amp;/g, '&');
  }
  return null;
}

function buildInviteMessage(d: GmailMessageDetail): string {
  const url = extractProductUrl(d.body);
  const gmailLink = `https://mail.google.com/mail/u/0/#all/${d.id}`;
  const lines = [
    '🎉 <b>Amazon invitation to buy has arrived!</b>',
    '',
    `<b>${escapeHtml(d.subject)}</b>`,
    escapeHtml(d.snippet.slice(0, 240)),
    '',
  ];
  if (url) lines.push(`🔗 <a href="${escapeHtml(url)}">Buy it on Amazon</a>`);
  lines.push(`📧 <a href="${gmailLink}">Open the email in Gmail</a>`);
  lines.push('');
  lines.push('⏳ These invites usually expire in ~72 hours. Be quick.');
  return lines.join('\n');
}

// Checks Gmail for a real Amazon invitation-to-buy and pings Telegram once per invite.
// Uses only Gmail + Telegram APIs (both free) — no Claude/Anthropic cost.
export async function checkAmazonInvites(opts: { dryRun?: boolean } = {}): Promise<InviteResult> {
  const dryRun = !!opts.dryRun;
  try {
    // Ensure the dedupe label exists so the `-label:` filter is always valid.
    const labelId = await findOrCreateLabel(ALERT_LABEL);

    const ids = await searchEmails(QUERY, 50);
    const items: InviteItem[] = [];
    let alerted = 0;

    for (const id of ids) {
      const detail = await getMessageDetail(id);
      if (!detail) continue;

      if (NEGATIVE.some((re) => re.test(detail.subject))) continue;

      const haystack = `${detail.subject}\n${detail.snippet}\n${detail.body}`;
      if (!POSITIVE.some((re) => re.test(haystack))) continue;

      items.push({ id, subject: detail.subject });
      if (dryRun) continue;

      const tg = await sendTelegram(buildInviteMessage(detail));
      if (tg.ok) {
        alerted += 1;
        // Only label after a successful send, so a failed ping retries next run.
        if (labelId) await modifyEmailLabels(id, [labelId], []);
      }
    }

    return { ok: true, candidates: items.length, alerted, items, query: QUERY, dryRun };
  } catch (err) {
    return {
      ok: false,
      candidates: 0,
      alerted: 0,
      items: [],
      query: QUERY,
      dryRun,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
