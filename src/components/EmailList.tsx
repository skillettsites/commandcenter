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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400">Emails</h2>
        <span className="text-xs text-gray-600">{emails.length} unread</span>
      </div>
      <div className="space-y-1.5">
        {emails.map((email) => (
          <a
            key={email.id}
            href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{email.subject || '(no subject)'}</p>
                <p className="text-xs text-gray-400 truncate">{email.from}</p>
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0">{formatDate(email.date)}</span>
            </div>
          </a>
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
