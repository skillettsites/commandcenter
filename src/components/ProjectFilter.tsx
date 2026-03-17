'use client';

import { projects } from '@/lib/projects';

interface ProjectFilterProps {
  selected: string;
  onChange: (project: string) => void;
}

export default function ProjectFilter({ selected, onChange }: ProjectFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onChange('all')}
        className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
          selected === 'all'
            ? 'bg-white text-black'
            : 'bg-[var(--bg-card)] text-[var(--text-secondary)] active:text-[var(--text-primary)]'
        }`}
      >
        All
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
            selected === p.id
              ? 'text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] active:text-[var(--text-primary)]'
          }`}
          style={selected === p.id ? { backgroundColor: p.color } : { backgroundColor: 'var(--bg-card)' }}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
