'use client';

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

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
      isDone
        ? 'bg-gray-900/50 border-gray-800 opacity-60'
        : 'bg-gray-900 border-gray-800 hover:border-gray-700'
    }`}>
      <button
        onClick={() => onStatusChange(task.id, isDone ? 'pending' : 'done')}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${
          isDone
            ? 'bg-green-500 border-green-500'
            : 'border-gray-600 hover:border-blue-500'
        }`}
        title={isDone ? 'Mark pending' : 'Mark done'}
      >
        {isDone && (
          <svg className="w-full h-full text-white p-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isDone ? 'line-through text-gray-500' : 'text-white'}`}>
          {task.description}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${project?.color}20`, color: project?.color }}
          >
            {project?.name || task.project}
          </span>
          {task.priority === 'high' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
              High
            </span>
          )}
          <span className="text-xs text-gray-600">{timeAgo}</span>
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        className="flex-shrink-0 text-gray-600 hover:text-red-400 transition-colors p-1"
        title="Delete task"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
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
