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

function SenderGroupCard({ group }: { group: SenderGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg
            className={`w-3 h-3 text-gray-500 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <p className="text-xs font-medium text-gray-300 truncate">{group.sender}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-medium">
            {group.emails.length}
          </span>
          <span className="text-xs text-gray-600">{formatDate(group.latestDate)}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/50">
          {group.emails.map((email) => (
            <div key={email.id}>
              <button
                onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
                className="w-full text-left px-3 py-2 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-white truncate flex-1">{email.subject || '(no subject)'}</p>
                  <span className="text-xs text-gray-600 flex-shrink-0">{formatDate(email.date)}</span>
                </div>
              </button>

              {expandedEmailId === email.id && (
                <div className="px-3 pb-3">
                  <p className="text-xs text-gray-400 leading-relaxed mb-2">{email.snippet}</p>
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Open in Gmail
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
      <div className="space-y-1.5">
        {groups.map((group) => (
          <SenderGroupCard key={group.sender} group={group} />
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
