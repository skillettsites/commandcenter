'use client';

import { useState } from 'react';
import { projects } from '@/lib/projects';

interface TaskInputProps {
  onTaskAdded: () => void;
}

export default function TaskInput({ onTaskAdded }: TaskInputProps) {
  const [description, setDescription] = useState('');
  const [project, setProject] = useState('general');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, description: description.trim() }),
      });
      if (res.ok) {
        setDescription('');
        onTaskAdded();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What needs doing?"
        rows={2}
        className="w-full bg-[var(--bg-elevated)] rounded-xl px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-[15px] leading-snug"
      />
      <div className="flex gap-2">
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="flex-1 bg-[var(--bg-elevated)] rounded-xl px-4 py-2.5 text-[var(--text-primary)] text-[15px] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] appearance-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting || !description.trim()}
          className="bg-[var(--accent)] active:bg-[var(--accent-hover)] disabled:opacity-40 text-[var(--text-primary)] font-semibold px-6 py-2.5 rounded-xl text-[15px] transition-opacity"
        >
          {submitting ? '...' : 'Add'}
        </button>
      </div>
    </form>
  );
}
