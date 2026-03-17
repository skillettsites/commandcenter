'use client';

import { useRef, useState } from 'react';
import { Task } from '@/lib/types';
import { getProject } from '@/lib/projects';

interface TaskCardProps {
  task: Task;
  onStatusChange: (id: string, status: 'pending' | 'done') => void;
  onDelete: (id: string) => void;
}

export default function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
  const project = getProject(task.project);
  const isDone = task.status === 'done';
  const timeAgo = getTimeAgo(task.created_at);

  const [swiped, setSwiped] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const diff = e.touches[0].clientX - startXRef.current;
    currentXRef.current = diff;
    if (cardRef.current && diff < 0) {
      cardRef.current.style.transform = `translateX(${Math.max(diff, -120)}px)`;
    }
  }

  function handleTouchEnd() {
    if (currentXRef.current < -80) {
      setSwiped(true);
      if (cardRef.current) {
        cardRef.current.style.transform = 'translateX(-120px)';
      }
    } else if (cardRef.current) {
      cardRef.current.style.transform = 'translateX(0)';
    }
  }

  function handleConfirmDelete() {
    setDismissed(true);
    setTimeout(() => onDelete(task.id), 300);
  }

  function handleUndo() {
    setSwiped(false);
    if (cardRef.current) {
      cardRef.current.style.transform = 'translateX(0)';
    }
  }

  if (dismissed) return null;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe actions */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          onClick={handleUndo}
          className="w-15 flex items-center justify-center bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[13px] font-medium px-3"
        >
          Undo
        </button>
        <button
          onClick={handleConfirmDelete}
          className="w-15 flex items-center justify-center bg-[var(--red)] text-[var(--text-primary)] text-[13px] font-medium px-3"
        >
          Delete
        </button>
      </div>

      {/* Card */}
      <div
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative flex items-start gap-3 p-4 card ${
          isDone ? 'opacity-50' : ''
        } ${swiped ? '' : 'rounded-xl'}`}
        style={{ transition: swiped ? 'none' : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' }}
      >
        {/* Checkbox */}
        <button
          onClick={() => onStatusChange(task.id, isDone ? 'pending' : 'done')}
          className={`mt-0.5 flex-shrink-0 w-[22px] h-[22px] rounded-full border-2 transition-all ${
            isDone
              ? 'bg-[var(--green)] border-[var(--green)]'
              : 'border-[var(--text-tertiary)] active:border-[var(--accent)]'
          }`}
        >
          {isDone && (
            <svg className="w-full h-full text-[var(--text-primary)] p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`text-[15px] leading-snug ${isDone ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
            {task.description}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: `${project?.color}25`, color: project?.color }}
            >
              {project?.name || task.project}
            </span>
            {task.priority === 'high' && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(255,69,58,0.2)', color: 'var(--red)' }}>
                High
              </span>
            )}
            <span className="text-[11px] text-[var(--text-tertiary)]">{timeAgo}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
