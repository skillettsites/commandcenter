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
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What needs doing? e.g. &quot;Make the report headings bolder&quot;"
        rows={2}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      />
      <div className="flex gap-2">
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
    </form>
  );
}
