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
    scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email',
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

export async function modifyEmailLabels(
  emailId: string,
  addLabels: string[],
  removeLabels: string[]
): Promise<boolean> {
  const token = await getValidToken();
  if (!token) return false;

  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addLabelIds: addLabels,
          removeLabelIds: removeLabels,
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function batchModifyEmails(
  messageIds: string[],
  addLabels: string[],
  removeLabels: string[]
): Promise<boolean> {
  const token = await getValidToken();
  if (!token) return false;

  try {
    // Gmail batch modify supports up to 1000 IDs per request
    for (let i = 0; i < messageIds.length; i += 1000) {
      const batch = messageIds.slice(i, i + 1000);
      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ids: batch,
            addLabelIds: addLabels,
            removeLabelIds: removeLabels,
          }),
        }
      );
      if (!res.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function batchTrashEmails(messageIds: string[]): Promise<boolean> {
  const token = await getValidToken();
  if (!token) return false;

  try {
    for (let i = 0; i < messageIds.length; i += 1000) {
      const batch = messageIds.slice(i, i + 1000);
      const res = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ids: batch,
            addLabelIds: ['TRASH'],
            removeLabelIds: ['INBOX', 'UNREAD'],
          }),
        }
      );
      if (!res.ok) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function searchEmails(query: string, maxResults = 500): Promise<string[]> {
  const token = await getValidToken();
  if (!token) return [];

  const allIds: string[] = [];
  let pageToken: string | null = null;

  try {
    while (true) {
      let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(maxResults - allIds.length, 500)}&q=${encodeURIComponent(query)}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) break;

      const data = await res.json();
      const msgs = data.messages || [];
      allIds.push(...msgs.map((m: { id: string }) => m.id));

      if (!data.nextPageToken || allIds.length >= maxResults) break;
      pageToken = data.nextPageToken;
    }
    return allIds;
  } catch {
    return [];
  }
}

export async function getImportantEmails(maxResults = 20): Promise<{ emails: GmailMessage[]; connected: boolean }> {
  const token = await getValidToken();
  if (!token) return { emails: [], connected: false };

  try {
    // Fetch unread inbox emails, excluding promotions/social/forums categories
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:unread in:inbox -category:promotions -category:social -category:forums -unsubscribe`,
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

        const from = getHeader('From').replace(/<[^>]+>/g, '').trim();
        const subject = getHeader('Subject');

        // Skip emails with no sender or subject (broken imports)
        if (!from && !subject) return null;

        return {
          id: msg.id,
          subject,
          from,
          snippet: msgData.snippet || '',
          date: getHeader('Date'),
          unread: msgData.labelIds?.includes('UNREAD') ?? false,
        };
      })
    );

    const filtered = emails.filter((e): e is GmailMessage => e !== null);

    return { emails: filtered, connected: true };
  } catch {
    return { emails: [], connected: false };
  }
}
