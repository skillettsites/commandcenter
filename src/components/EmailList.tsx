'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
  label: string;
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

async function dismissEmailApi(emailId: string, undo = false): Promise<boolean> {
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

function SwipeableEmailRow({
  email,
  onDismiss,
  onTap,
  isExpanded,
}: {
  email: Email;
  onDismiss: (emailId: string) => void;
  onTap: () => void;
  isExpanded: boolean;
}) {
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const [swiping, setSwiping] = useState(false);

  function handleTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
    setSwiping(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const diff = e.touches[0].clientX - startXRef.current;
    currentXRef.current = diff;
    if (Math.abs(diff) > 10) setSwiping(true);
    if (rowRef.current && diff < 0) {
      rowRef.current.style.transform = `translateX(${Math.max(diff, -100)}px)`;
    }
  }

  function handleTouchEnd() {
    if (currentXRef.current < -60) {
      onDismiss(email.id);
    } else if (rowRef.current) {
      rowRef.current.style.transform = 'translateX(0)';
    }
  }

  return (
    <div className="relative overflow-hidden">
      {/* Swipe background */}
      <div className="absolute inset-0 flex items-center justify-end pr-4 bg-[var(--red)]">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </div>

      {/* Foreground row */}
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => !swiping && onTap()}
        className="relative bg-[var(--bg-card)] px-4 py-3 active:bg-[var(--bg-elevated)] transition-colors"
        style={{ transition: swiping ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[15px] text-white leading-snug truncate">
              {email.subject || '(no subject)'}
            </p>
            {isExpanded && (
              <div className="mt-2 fade-in">
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{email.snippet}</p>
                <a
                  href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-[13px] text-[var(--accent)] font-medium"
                >
                  Open in Gmail
                </a>
              </div>
            )}
          </div>
          <span className="text-[12px] text-[var(--text-tertiary)] flex-shrink-0 pt-0.5">
            {formatDate(email.date)}
          </span>
        </div>
      </div>
    </div>
  );
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
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const [swiping, setSwiping] = useState(false);

  function handleTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
    setSwiping(false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const diff = e.touches[0].clientX - startXRef.current;
    currentXRef.current = diff;
    if (Math.abs(diff) > 10) setSwiping(true);
    if (headerRef.current && diff < 0) {
      headerRef.current.style.transform = `translateX(${Math.max(diff, -100)}px)`;
    }
  }

  function handleTouchEnd() {
    if (currentXRef.current < -60) {
      onDismissGroup(group.sender);
    } else if (headerRef.current) {
      headerRef.current.style.transform = 'translateX(0)';
    }
  }

  // Get initials for avatar
  const name = group.sender.replace(/<[^>]+>/g, '').trim();
  const initials = name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <div className="card overflow-hidden">
      {/* Swipeable header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-end pr-4 bg-[var(--red)]">
          <span className="text-[13px] text-white font-medium">Dismiss</span>
        </div>
        <div
          ref={headerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={() => !swiping && setExpanded(!expanded)}
          className="relative flex items-center gap-3 px-4 py-3 bg-[var(--bg-card)] active:bg-[var(--bg-elevated)] transition-colors"
          style={{ transition: swiping ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' }}
        >
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <span className="text-[13px] font-semibold text-white">{initials || '?'}</span>
          </div>

          {/* Sender info */}
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-white truncate">{name}</p>
            <p className="text-[13px] text-[var(--text-secondary)] truncate">
              {group.emails.length === 1
                ? group.emails[0].subject || '(no subject)'
                : `${group.emails.length} emails`}
            </p>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[12px] text-[var(--text-tertiary)]">{formatDate(group.latestDate)}</span>
            <svg
              className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Expanded emails */}
      {expanded && (
        <div className="divide-y divide-[var(--border-light)]">
          {group.emails.map((email) => (
            <SwipeableEmailRow
              key={email.id}
              email={email}
              onDismiss={onDismissEmail}
              onTap={() => setExpandedEmailId(expandedEmailId === email.id ? null : email.id)}
              isExpanded={expandedEmailId === email.id}
            />
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
    if (dismissed?.timer) clearTimeout(dismissed.timer);

    const email = emails.find(e => e.id === emailId);
    setEmails(prev => prev.filter(e => e.id !== emailId));

    // Dismiss immediately so closing the page won't lose the action
    dismissEmailApi(emailId);

    const timer = setTimeout(() => {
      setDismissed(null);
    }, 5000);

    setDismissed({
      type: 'email',
      emailIds: [emailId],
      label: email?.subject || 'Email',
      timer,
    });
  }, [dismissed, emails]);

  const handleDismissGroup = useCallback((sender: string) => {
    if (dismissed?.timer) clearTimeout(dismissed.timer);

    const groupEmails = emails.filter(e => e.from === sender);
    const groupEmailIds = groupEmails.map(e => e.id);
    setEmails(prev => prev.filter(e => e.from !== sender));

    // Dismiss all immediately so closing the page won't lose the action
    groupEmailIds.forEach(id => dismissEmailApi(id));

    const name = sender.replace(/<[^>]+>/g, '').trim();
    const timer = setTimeout(() => {
      setDismissed(null);
    }, 5000);

    setDismissed({
      type: 'group',
      emailIds: groupEmailIds,
      label: name,
      timer,
    });
  }, [dismissed, emails]);

  const handleUndo = useCallback(() => {
    if (!dismissed) return;
    clearTimeout(dismissed.timer);

    // Undo by restoring the IMPORTANT label via API
    dismissed.emailIds.forEach(id => dismissEmailApi(id, true));

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
      <div className="space-y-3">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">
          Mail
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 card animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">
          Mail
        </h2>
        <a
          href="/api/auth/google"
          className="card flex items-center justify-center gap-2 p-4 text-[15px] text-[var(--accent)] font-medium active:bg-[var(--bg-elevated)]"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20v12z"/>
          </svg>
          Connect Gmail
        </a>
      </div>
    );
  }

  if (emails.length === 0 && !dismissed) {
    return (
      <div className="space-y-3">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">
          Mail
        </h2>
        <div className="card px-4 py-6 text-center">
          <p className="text-[15px] text-[var(--text-tertiary)]">No unread emails</p>
        </div>
      </div>
    );
  }

  const groups = groupBySender(emails);
  const visibleGroups = showAll ? groups : groups.slice(0, 3);
  const hasMore = groups.length > 3;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Mail
        </h2>
        <span className="text-[13px] text-[var(--text-tertiary)]">{emails.length} unread</span>
      </div>

      <div className="space-y-2">
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
          className="w-full text-center text-[13px] text-[var(--accent)] font-medium py-2 active:opacity-60"
        >
          {showAll ? 'Show Less' : `Show ${groups.length - 3} More`}
        </button>
      )}

      {/* Fixed bottom toast */}
      {dismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 toast-enter">
          <div className="max-w-lg mx-auto flex items-center justify-between bg-[var(--bg-elevated)] backdrop-blur-xl rounded-2xl px-4 py-3.5 shadow-2xl shadow-black/60 border border-[var(--border)]">
            <div className="flex items-center gap-3 min-w-0">
              {/* Countdown ring */}
              <div className="relative w-7 h-7 flex-shrink-0">
                <svg className="w-7 h-7 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="14" fill="none" stroke="var(--border)" strokeWidth="2" />
                  <circle
                    cx="16" cy="16" r="14" fill="none"
                    stroke="var(--accent)" strokeWidth="2"
                    strokeDasharray="88" strokeDashoffset="0"
                    strokeLinecap="round"
                    className="countdown-ring"
                  />
                </svg>
              </div>
              <p className="text-[14px] text-white truncate">
                {dismissed.type === 'group'
                  ? `${dismissed.label} dismissed`
                  : 'Email dismissed'}
              </p>
            </div>
            <button
              onClick={handleUndo}
              className="text-[15px] text-[var(--accent)] font-semibold ml-3 px-3 py-1.5 rounded-lg active:bg-[var(--accent)]/20 flex-shrink-0"
            >
              Undo
            </button>
          </div>
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
