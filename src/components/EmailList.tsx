'use client';

import { useState, useEffect, useCallback } from 'react';

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

interface DismissedItem {
  type: 'email' | 'group';
  emailIds: string[];
  sender?: string;
  timer: ReturnType<typeof setTimeout>;
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

async function dismissEmail(emailId: string, undo = false): Promise<boolean> {
  try {
    const res = await fetch('/api/emails/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId, undo }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function SenderGroupCard({
  group,
  onDismissEmail,
  onDismissGroup,
}: {
  group: SenderGroup;
  onDismissEmail: (emailId: string) => void;
  onDismissGroup: (sender: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-800/50 transition-colors"
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismissGroup(group.sender);
          }}
          className="px-2 py-2.5 text-gray-600 hover:text-red-400 transition-colors"
          title="Mark not important"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/50">
          {group.emails.map((email) => (
            <div key={email.id}>
              <div className="flex items-center">
                <button
                  onClick={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
                  className="flex-1 text-left px-3 py-2 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-white truncate flex-1">{email.subject || '(no subject)'}</p>
                    <span className="text-xs text-gray-600 flex-shrink-0">{formatDate(email.date)}</span>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissEmail(email.id);
                  }}
                  className="px-2 py-2 text-gray-700 hover:text-red-400 transition-colors"
                  title="Mark not important"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

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
  const [showAll, setShowAll] = useState(false);
  const [dismissed, setDismissed] = useState<DismissedItem | null>(null);

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

  const handleDismissEmail = useCallback((emailId: string) => {
    // Clear any existing undo timer
    if (dismissed?.timer) clearTimeout(dismissed.timer);

    // Remove from UI immediately
    setEmails(prev => prev.filter(e => e.id !== emailId));

    // Set up undo with 5s timer
    const timer = setTimeout(() => {
      dismissEmail(emailId);
      setDismissed(null);
    }, 5000);

    setDismissed({ type: 'email', emailIds: [emailId], timer });
  }, [dismissed]);

  const handleDismissGroup = useCallback((sender: string) => {
    if (dismissed?.timer) clearTimeout(dismissed.timer);

    const groupEmailIds = emails.filter(e => e.from === sender).map(e => e.id);
    setEmails(prev => prev.filter(e => e.from !== sender));

    const timer = setTimeout(() => {
      groupEmailIds.forEach(id => dismissEmail(id));
      setDismissed(null);
    }, 5000);

    setDismissed({ type: 'group', emailIds: groupEmailIds, sender, timer });
  }, [dismissed, emails]);

  const handleUndo = useCallback(() => {
    if (!dismissed) return;
    clearTimeout(dismissed.timer);

    // Re-fetch emails to restore
    async function refetch() {
      try {
        const res = await fetch('/api/emails');
        if (res.ok) {
          const data = await res.json();
          setEmails(data.emails);
        }
      } catch { /* ignore */ }
    }
    refetch();
    setDismissed(null);
  }, [dismissed]);

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

  if (emails.length === 0 && !dismissed) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-400">Emails</h2>
        <p className="text-center text-gray-600 py-4 text-sm">No unread emails</p>
      </div>
    );
  }

  const groups = groupBySender(emails);
  const visibleGroups = showAll ? groups : groups.slice(0, 3);
  const hasMore = groups.length > 3;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400">Emails</h2>
        <span className="text-xs text-gray-600">{emails.length} unread</span>
      </div>

      <div className="space-y-1.5">
        {visibleGroups.map((group) => (
          <SenderGroupCard
            key={group.sender}
            group={group}
            onDismissEmail={handleDismissEmail}
            onDismissGroup={handleDismissGroup}
          />
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center text-xs text-gray-500 hover:text-gray-300 py-1.5 transition-colors"
        >
          {showAll ? 'Show less' : `+ ${groups.length - 3} more senders`}
        </button>
      )}

      {dismissed && (
        <div className="fixed bottom-6 left-4 right-4 z-50 flex items-center justify-between bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 shadow-lg shadow-black/50">
          <p className="text-sm text-white font-medium">
            {dismissed.type === 'group'
              ? `${dismissed.emailIds.length} emails dismissed`
              : 'Email dismissed'}
          </p>
          <button
            onClick={handleUndo}
            className="text-sm text-blue-400 hover:text-blue-300 font-semibold ml-4 px-3 py-1 bg-blue-500/20 rounded-lg"
          >
            Undo
          </button>
        </div>
      )}
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
