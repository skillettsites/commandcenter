'use client';

import { projects } from '@/lib/projects';

interface ProjectFilterProps {
  selected: string;
  onChange: (project: string) => void;
}

export default function ProjectFilter({ selected, onChange }: ProjectFilterProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => onChange('all')}
        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          selected === 'all'
            ? 'bg-white text-black'
            : 'bg-gray-800 text-gray-400 hover:text-white'
        }`}
      >
        All
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            selected === p.id
              ? 'text-white'
              : 'text-gray-400 hover:text-white'
          }`}
          style={selected === p.id ? { backgroundColor: p.color } : { backgroundColor: '#1f2937' }}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
