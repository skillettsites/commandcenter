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

interface LabelInfo {
  id: string;
  name: string;
  messagesTotal: number;
  messagesUnread: number;
}

interface SenderGroup {
  sender: string;
  senderName: string;
  emails: Email[];
  latestDate: string;
}

interface DismissedItem {
  type: 'email' | 'group';
  emailIds: string[];
  label: string;
  timer: ReturnType<typeof setTimeout>;
}

const LABEL_COLORS: Record<string, string> = {
  'CarCostCheck': '#3B82F6',
  'PostcodeCheck': '#10B981',
  'TapWaterScore': '#06B6D4',
  'MedCostCheck': '#8B5CF6',
  'FindYourStay': '#F59E0B',
  'HelpAfterLoss': '#EC4899',
  'HelpAfterLife': '#D946EF',
  'AI Bet Finder': '#F43F5E',
  'DavidSkillett': '#6366F1',
  'Dashboard': '#F97316',
  'Domains': '#14B8A6',
  'Hosting': '#8B5CF6',
  'Finance': '#22C55E',
};

function extractName(from: string): string {
  return from.replace(/<[^>]+>/g, '').trim();
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
      senderName: extractName(sender),
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

type ViewMode = 'inbox' | 'senders' | 'label';

export default function EmailList() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<DismissedItem | null>(null);
  const [labels, setLabels] = useState<LabelInfo[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [labelsLoading, setLabelsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('inbox');
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSender, setExpandedSender] = useState<string | null>(null);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

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
    async function fetchLabels() {
      try {
        const res = await fetch('/api/emails/labels');
        if (res.ok) {
          const data = await res.json();
          setLabels(data.labels || []);
        }
      } finally {
        setLabelsLoading(false);
      }
    }
    fetchEmails();
    fetchLabels();
  }, []);

  const handleDismissEmail = useCallback((emailId: string) => {
    if (dismissed?.timer) clearTimeout(dismissed.timer);
    const email = emails.find(e => e.id === emailId);
    setEmails(prev => prev.filter(e => e.id !== emailId));
    dismissEmailApi(emailId);
    const timer = setTimeout(() => setDismissed(null), 5000);
    setDismissed({ type: 'email', emailIds: [emailId], label: email?.subject || 'Email', timer });
  }, [dismissed, emails]);

  const handleDismissGroup = useCallback((sender: string) => {
    if (dismissed?.timer) clearTimeout(dismissed.timer);
    const groupEmails = emails.filter(e => e.from === sender);
    const groupEmailIds = groupEmails.map(e => e.id);
    setEmails(prev => prev.filter(e => e.from !== sender));
    groupEmailIds.forEach(id => dismissEmailApi(id));
    const name = extractName(sender);
    const timer = setTimeout(() => setDismissed(null), 5000);
    setDismissed({ type: 'group', emailIds: groupEmailIds, label: name, timer });
  }, [dismissed, emails]);

  const handleUndo = useCallback(() => {
    if (!dismissed) return;
    clearTimeout(dismissed.timer);
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
      <div className="space-y-2">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">Mail</h2>
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-14 card animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-2">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">Mail</h2>
        <a href="/api/auth/google" className="card flex items-center justify-center gap-2 p-4 text-[15px] text-[var(--accent)] font-medium active:bg-[var(--bg-elevated)]">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20v12z"/></svg>
          Connect Gmail
        </a>
      </div>
    );
  }

  const groups = groupBySender(emails);
  const activeLabelInfo = labels.find(l => l.id === activeLabel);

  function handleLabelClick(labelId: string) {
    if (activeLabel === labelId) {
      setActiveLabel(null);
      setViewMode('inbox');
    } else {
      setActiveLabel(labelId);
      setViewMode('label');
    }
  }

  function handleViewChange(mode: ViewMode) {
    setActiveLabel(null);
    setViewMode(mode);
    setExpandedSender(null);
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div
        className="flex items-center justify-between px-1 cursor-pointer active:opacity-70"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Mail</h2>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
        <span className="text-[13px] text-[var(--text-tertiary)]">
          {emails.length} unread
        </span>
      </div>

      {collapsed ? null : (
        <div className="space-y-2 fade-in">
          {/* View mode tabs */}
          <div className="flex gap-1 bg-[var(--bg-card)] rounded-xl p-1">
            <button
              onClick={() => handleViewChange('inbox')}
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                viewMode === 'inbox' && !activeLabel
                  ? 'bg-[var(--bg-elevated)] text-white shadow-sm'
                  : 'text-[var(--text-tertiary)] active:text-white'
              }`}
            >
              Latest
            </button>
            <button
              onClick={() => handleViewChange('senders')}
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                viewMode === 'senders'
                  ? 'bg-[var(--bg-elevated)] text-white shadow-sm'
                  : 'text-[var(--text-tertiary)] active:text-white'
              }`}
            >
              By Sender
            </button>
          </div>

          {/* Project/Label filter pills */}
          {!labelsLoading && labels.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {labels.map((label) => {
                const color = LABEL_COLORS[label.name] || '#6B7280';
                const isActive = activeLabel === label.id;
                return (
                  <button
                    key={label.id}
                    onClick={() => handleLabelClick(label.id)}
                    className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors flex items-center gap-1 ${
                      isActive
                        ? 'text-white'
                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)] active:bg-[var(--bg-elevated)]'
                    }`}
                    style={isActive ? { backgroundColor: color } : {}}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: isActive ? 'white' : color }} />
                    {label.name}
                    {label.messagesUnread > 0 && (
                      <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-[var(--accent)]'}`}>
                        {label.messagesUnread}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Content */}
          {activeLabel ? (
            <LabelEmailList labelId={activeLabel} labelName={activeLabelInfo?.name || 'Label'} />
          ) : viewMode === 'senders' ? (
            <SenderView
              groups={groups}
              expandedSender={expandedSender}
              expandedEmailId={expandedEmailId}
              onToggleSender={(s) => setExpandedSender(expandedSender === s ? null : s)}
              onToggleEmail={(id) => setExpandedEmailId(expandedEmailId === id ? null : id)}
              onDismissEmail={handleDismissEmail}
              onDismissGroup={handleDismissGroup}
            />
          ) : (
            <InboxView
              emails={emails}
              expandedEmailId={expandedEmailId}
              onToggleEmail={(id) => setExpandedEmailId(expandedEmailId === id ? null : id)}
              onDismissEmail={handleDismissEmail}
            />
          )}
        </div>
      )}

      {/* Undo toast */}
      {dismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 toast-enter">
          <div className="max-w-lg mx-auto flex items-center justify-between bg-[var(--bg-elevated)] backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl shadow-black/60 border border-[var(--border)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-6 h-6 flex-shrink-0">
                <svg className="w-6 h-6 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="14" fill="none" stroke="var(--border)" strokeWidth="2" />
                  <circle cx="16" cy="16" r="14" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="88" strokeDashoffset="0" strokeLinecap="round" className="countdown-ring" />
                </svg>
              </div>
              <p className="text-[13px] text-white truncate">
                {dismissed.type === 'group' ? `${dismissed.label} dismissed` : 'Email dismissed'}
              </p>
            </div>
            <button onClick={handleUndo} className="text-[14px] text-[var(--accent)] font-semibold ml-3 px-2 py-1 rounded-lg active:bg-[var(--accent)]/20 flex-shrink-0">
              Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Inbox view: flat chronological list
function InboxView({
  emails,
  expandedEmailId,
  onToggleEmail,
  onDismissEmail,
}: {
  emails: Email[];
  expandedEmailId: string | null;
  onToggleEmail: (id: string) => void;
  onDismissEmail: (id: string) => void;
}) {
  if (emails.length === 0) {
    return (
      <div className="card px-4 py-5 text-center">
        <p className="text-[14px] text-[var(--text-tertiary)]">No unread emails</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden divide-y divide-[var(--border-light)]">
      {emails.map((email) => (
        <SwipeableEmailRow
          key={email.id}
          email={email}
          onDismiss={onDismissEmail}
          onTap={() => onToggleEmail(email.id)}
          isExpanded={expandedEmailId === email.id}
        />
      ))}
    </div>
  );
}

// Sender view: grouped by sender, expandable
function SenderView({
  groups,
  expandedSender,
  expandedEmailId,
  onToggleSender,
  onToggleEmail,
  onDismissEmail,
  onDismissGroup,
}: {
  groups: SenderGroup[];
  expandedSender: string | null;
  expandedEmailId: string | null;
  onToggleSender: (sender: string) => void;
  onToggleEmail: (id: string) => void;
  onDismissEmail: (id: string) => void;
  onDismissGroup: (sender: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="card px-4 py-5 text-center">
        <p className="text-[14px] text-[var(--text-tertiary)]">No unread emails</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden divide-y divide-[var(--border-light)]">
      {groups.map((group) => {
        const isExpanded = expandedSender === group.sender;
        const initials = group.senderName.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

        return (
          <div key={group.sender}>
            <SwipeableSenderRow
              group={group}
              initials={initials}
              isExpanded={isExpanded}
              onToggle={() => onToggleSender(group.sender)}
              onDismissGroup={() => onDismissGroup(group.sender)}
            />
            {isExpanded && (
              <div className="divide-y divide-[var(--border-light)] bg-[var(--bg-primary)]">
                {group.emails.map((email) => (
                  <SwipeableEmailRow
                    key={email.id}
                    email={email}
                    onDismiss={onDismissEmail}
                    onTap={() => onToggleEmail(email.id)}
                    isExpanded={expandedEmailId === email.id}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SwipeableSenderRow({
  group,
  initials,
  isExpanded,
  onToggle,
  onDismissGroup,
}: {
  group: SenderGroup;
  initials: string;
  isExpanded: boolean;
  onToggle: () => void;
  onDismissGroup: () => void;
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
      onDismissGroup();
    } else if (rowRef.current) {
      rowRef.current.style.transform = 'translateX(0)';
    }
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-end pr-4 bg-[var(--red)]">
        <span className="text-[12px] text-white font-medium">Dismiss</span>
      </div>
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => !swiping && onToggle()}
        className="relative flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--bg-card)] active:bg-[var(--bg-elevated)] transition-colors"
        style={{ transition: swiping ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' }}
      >
        <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
          <span className="text-[11px] font-semibold text-white">{initials || '?'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-white truncate">{group.senderName}</p>
          <p className="text-[12px] text-[var(--text-tertiary)] truncate">
            {group.emails.length === 1 ? (group.emails[0].subject || '(no subject)') : `${group.emails.length} emails`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-[var(--text-tertiary)]">{formatDate(group.latestDate)}</span>
          <svg
            className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function SwipeableEmailRow({
  email,
  onDismiss,
  onTap,
  isExpanded,
  showDismiss = true,
}: {
  email: Email;
  onDismiss: (emailId: string) => void;
  onTap: () => void;
  isExpanded: boolean;
  showDismiss?: boolean;
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
    if (!showDismiss) return;
    const diff = e.touches[0].clientX - startXRef.current;
    currentXRef.current = diff;
    if (Math.abs(diff) > 10) setSwiping(true);
    if (rowRef.current && diff < 0) {
      rowRef.current.style.transform = `translateX(${Math.max(diff, -100)}px)`;
    }
  }

  function handleTouchEnd() {
    if (showDismiss && currentXRef.current < -60) {
      onDismiss(email.id);
    } else if (rowRef.current) {
      rowRef.current.style.transform = 'translateX(0)';
    }
  }

  return (
    <div className="relative overflow-hidden">
      {showDismiss && (
        <div className="absolute inset-0 flex items-center justify-end pr-4 bg-[var(--red)]">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
      )}
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => !swiping && onTap()}
        className="relative bg-[var(--bg-card)] px-3.5 py-2.5 active:bg-[var(--bg-elevated)] transition-colors"
        style={{ transition: swiping ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-white leading-snug truncate">
              {email.subject || '(no subject)'}
            </p>
            <p className="text-[12px] text-[var(--text-tertiary)] truncate mt-0.5">
              {extractName(email.from)}
            </p>
            {isExpanded && (
              <div className="mt-2 fade-in">
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{email.snippet}</p>
                <a
                  href={`https://mail.google.com/mail/u/0/#inbox/${email.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-1.5 text-[12px] text-[var(--accent)] font-medium"
                >
                  Open in Gmail
                </a>
              </div>
            )}
          </div>
          <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0 pt-0.5">
            {formatDate(email.date)}
          </span>
        </div>
      </div>
    </div>
  );
}

function LabelEmailList({ labelId, labelName }: { labelId: string; labelName: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/emails/labels?labelId=${labelId}`);
        if (res.ok) {
          const data = await res.json();
          setEmails(data.emails || []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [labelId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-14 card animate-pulse" />)}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="card px-4 py-5 text-center">
        <p className="text-[14px] text-[var(--text-tertiary)]">No emails in {labelName}</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden divide-y divide-[var(--border-light)]">
      {emails.map((email) => (
        <SwipeableEmailRow
          key={email.id}
          email={email}
          onDismiss={() => {}}
          onTap={() => setExpandedId(expandedId === email.id ? null : email.id)}
          isExpanded={expandedId === email.id}
          showDismiss={false}
        />
      ))}
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
