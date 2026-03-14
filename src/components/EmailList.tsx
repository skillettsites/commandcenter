'use client';

import { useState, useEffect } from 'react';

interface Email {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  unread: boolean;
}

interface SenderGroup {
  sender: string;
  emails: Email[];
  latestDate: string;
}

function groupBySender(emails: Email[]): SenderGroup[] {
  const groups = new Map<string, Email[]>();

  for (const email of emails) {
    const sender = email.from;
    if (!groups.has(sender)) groups.set(sender, []);
    groups.get(sender)!.push(email);
  }

  return Array.from(groups.entries())
    .map(([sender, emails]) => ({
      sender,
      emails,
      latestDate: emails[0].date,
    }))
    .sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
}

export default function EmailList() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEmails() {
      try {
        const res = await fetch('/api/emails');
        if (res.ok) {
          const data = await res.json();
          setEmails(data.emails);
          setConnected(data.connected);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchEmails();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400">Emails</h2>
        <div className="h-16 bg-gray-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400">Emails</h2>
        <a
          href="/api/auth/google"
          className="block text-center bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-blue-400 hover:text-blue-300 hover:border-gray-700 transition-colors"
        >
          Connect Gmail
        </a>
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400">Emails</h2>
        <p className="text-center text-gray-600 py-4 text-sm">No unread emails</p>
      </div>
    );
  }

  const groups = groupBySender(emails);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400">Emails</h2>
        <span className="text-xs text-gray-600">{emails.length} unread</span>
      </div>
      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.sender} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
              <p className="text-xs font-medium text-gray-300 truncate">{group.sender}</p>
              <div className="flex items-center gap-2 flex-shrink-0">
                {group.emails.length > 1 && (
                  <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                    {group.emails.length}
                  </span>
                )}
                <span className="text-xs text-gray-600">{formatDate(group.latestDate)}</span>
              </div>
            </div>
            <div className="divide-y divide-gray-800/50">
              {group.emails.map((email) => (
                <a
                  key={email.id}
                  href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-3 py-2 hover:bg-gray-800/50 transition-colors"
                >
                  <p className="text-sm text-white truncate">{email.subject || '(no subject)'}</p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffHours < 1) return `${Math.floor(diffMs / 60000)}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}
