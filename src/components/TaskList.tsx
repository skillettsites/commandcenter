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

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (projectFilter !== 'all') params.set('project', projectFilter);

    const res = await fetch(`/api/tasks?${params}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data);
    }
    setLoading(false);
  }, [filter, projectFilter]);

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

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(['pending', 'all', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f === 'pending' ? 'Pending' : f === 'all' ? 'All' : 'Done'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {loading ? 'Loading...' : `${pendingCount} pending`}
        </span>
      </div>

      <ProjectFilter selected={projectFilter} onChange={setProjectFilter} />

      <div className="space-y-2">
        {!loading && tasks.length === 0 && (
          <p className="text-center text-gray-600 py-8 text-sm">No tasks yet. Add one above.</p>
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
