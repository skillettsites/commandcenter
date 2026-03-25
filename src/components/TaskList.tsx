'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task } from '@/lib/types';
import TaskCard from './TaskCard';
import TaskInput from './TaskInput';
import ProjectFilter from './ProjectFilter';

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('pending');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [sortMode, setSortMode] = useState<'important' | 'latest'>('important');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (projectFilter !== 'all') params.set('project', projectFilter);
    if (sortMode === 'latest') params.set('sort', 'latest');

    const res = await fetch(`/api/tasks?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data);
    }
    setLoading(false);
  }, [filter, projectFilter, sortMode]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function handleStatusChange(id: string, status: 'pending' | 'done') {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchTasks();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
  }

  const pendingCount = tasks.filter(t => t.status !== 'done').length;

  return (
    <div className="space-y-4">
      <TaskInput onTaskAdded={fetchTasks} />

      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Tasks
        </h2>
        <span className="text-[13px] text-[var(--text-tertiary)]">
          {loading ? '...' : `${pendingCount} pending`}
        </span>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 bg-[var(--bg-card)] rounded-xl p-1">
        {(['pending', 'all', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all ${
              filter === f
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-tertiary)] active:text-[var(--text-primary)]'
            }`}
          >
            {f === 'pending' ? 'Pending' : f === 'all' ? 'All' : 'Done'}
          </button>
        ))}
      </div>

      <ProjectFilter selected={projectFilter} onChange={setProjectFilter} />

      {/* Sort toggle */}
      <div className="flex gap-1 bg-[var(--bg-card)] rounded-xl p-1">
        {([
          { key: 'important' as const, label: 'Most Important' },
          { key: 'latest' as const, label: 'Latest' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortMode(key)}
            className={`flex-1 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
              sortMode === key
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-tertiary)] active:text-[var(--text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {!loading && tasks.length === 0 && (
          <div className="card px-4 py-8 text-center">
            <p className="text-[15px] text-[var(--text-tertiary)]">No tasks yet</p>
          </div>
        )}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
