import { getServiceClient } from './supabase';

const TOKEN_ID = 'gmail_skillettsites';

interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  email: string | null;
}

export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string): Promise<void> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error);

  // Get user email
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const user = await userRes.json();

  const supabase = getServiceClient();
  await supabase.from('oauth_tokens').upsert({
    id: TOKEN_ID,
    provider: 'google',
    email: user.email,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function getValidToken(): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('id', TOKEN_ID)
    .single();

  if (!data) return null;

  const tokens = data as OAuthTokens;
  const expiresAt = new Date(tokens.expires_at);

  // Refresh if expiring within 5 minutes
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: tokens.refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });

    const refreshed = await res.json();
    if (!res.ok) return null;

    await supabase.from('oauth_tokens').update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', TOKEN_ID);

    return refreshed.access_token;
  }

  return tokens.access_token;
}

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export async function getImportantEmails(maxResults = 10): Promise<{ emails: GmailMessage[]; connected: boolean }> {
  const token = await getValidToken();
  if (!token) return { emails: [], connected: false };

  try {
    // Fetch important/unread emails
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:unread category:primary`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!listRes.ok) return { emails: [], connected: false };

    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) {
      return { emails: [], connected: true };
    }

    // Fetch details for each message
    const emails = await Promise.all(
      listData.messages.map(async (msg: { id: string }) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const msgData = await msgRes.json();

        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h: { name: string; value: string }) => h.name === name)?.value || '';

        return {
          id: msg.id,
          subject: getHeader('Subject'),
          from: getHeader('From').replace(/<[^>]+>/g, '').trim(),
          snippet: msgData.snippet || '',
          date: getHeader('Date'),
          unread: msgData.labelIds?.includes('UNREAD') ?? false,
        };
      })
    );

    return { emails, connected: true };
  } catch {
    return { emails: [], connected: false };
  }
}
