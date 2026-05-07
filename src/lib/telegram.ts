const API_BASE = 'https://api.telegram.org';
const MAX_LEN = 4000;

export interface TelegramResult {
  ok: boolean;
  sent: number;
  error?: string;
}

export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function chunk(text: string): string[] {
  if (text.length <= MAX_LEN) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > MAX_LEN) {
    let cut = rest.lastIndexOf('\n', MAX_LEN);
    if (cut < MAX_LEN * 0.5) cut = MAX_LEN;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) out.push(rest);
  return out;
}

export async function sendTelegram(text: string, chatId?: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const target = chatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !target) {
    return { ok: false, sent: 0, error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set' };
  }
  const parts = chunk(text);
  let sent = 0;
  for (const part of parts) {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: target,
        text: part,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, sent, error: `Telegram ${res.status}: ${body.slice(0, 300)}` };
    }
    sent += 1;
  }
  return { ok: true, sent };
}

export function formatLondonTime(unixSec: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(unixSec * 1000));
}

export function formatLondonDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(d);
}

export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === secret) return true;
  return false;
}
