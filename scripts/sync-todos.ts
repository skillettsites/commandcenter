/**
 * Sync MEMORY.md TODOs to Supabase via the /api/sync endpoint.
 *
 * Usage: npx tsx scripts/sync-todos.ts
 *
 * Requires environment variables:
 *   SYNC_URL - The command center URL (e.g. https://commandcenter-xxx.vercel.app)
 *   SYNC_SECRET - The secret token matching the deployed app
 *   MEMORY_PATH - Path to MEMORY.md (defaults to ~/.claude/projects/c--Users-daves-claude/memory/MEMORY.md)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

interface TodoItem {
  description: string;
  status: 'pending' | 'done';
}

interface SyncPayload {
  project: string;
  todos: TodoItem[];
}

const projectMap: Record<string, string> = {
  'CarCostCheck': 'carcostcheck',
  'TapWaterScore': 'tapwaterscore',
  'MedCostCheck': 'medcostcheck',
  'PostcodeCheck': 'postcodecheck',
  'HelpAfterLoss': 'helpafterloss',
  'FindYourStay': 'findyourstay',
  'CommandCenter': 'commandcenter',
  'Personal': 'personal',
  'Cross-Project': 'general',
};

function parseMemoryTodos(content: string): SyncPayload[] {
  const payloads: SyncPayload[] = [];
  let currentProject: string | null = null;
  let currentTodos: TodoItem[] = [];

  const lines = content.split('\n');
  let inTodoSection = false;

  for (const line of lines) {
    // Detect TODO section headers like "### CarCostCheck"
    const headerMatch = line.match(/^###\s+(.+)/);
    if (headerMatch && inTodoSection) {
      // Save previous project's todos
      if (currentProject && currentTodos.length > 0) {
        payloads.push({ project: currentProject, todos: currentTodos });
      }
      const name = headerMatch[1].trim();
      currentProject = projectMap[name] || name.toLowerCase().replace(/\s+/g, '');
      currentTodos = [];
      continue;
    }

    // Detect the TODOs section start
    if (line.match(/^## TODOs/)) {
      inTodoSection = true;
      continue;
    }

    // Detect next major section (end of TODOs)
    if (inTodoSection && line.match(/^## /) && !line.match(/^## TODOs/)) {
      if (currentProject && currentTodos.length > 0) {
        payloads.push({ project: currentProject, todos: currentTodos });
      }
      break;
    }

    if (!inTodoSection) continue;

    // First header in TODOs section
    if (headerMatch && !currentProject) {
      const name = headerMatch[1].trim();
      currentProject = projectMap[name] || name.toLowerCase().replace(/\s+/g, '');
      currentTodos = [];
      continue;
    }

    // Parse todo items
    const todoMatch = line.match(/^- \[([ x])\]\s+(.+)/);
    if (todoMatch && currentProject) {
      currentTodos.push({
        description: todoMatch[2].trim(),
        status: todoMatch[1] === 'x' ? 'done' : 'pending',
      });
    }
  }

  // Don't forget the last project
  if (currentProject && currentTodos.length > 0) {
    payloads.push({ project: currentProject, todos: currentTodos });
  }

  return payloads;
}

async function main() {
  const syncUrl = process.env.SYNC_URL;
  const syncSecret = process.env.SYNC_SECRET;
  const memoryPath = process.env.MEMORY_PATH ||
    resolve(process.env.HOME || process.env.USERPROFILE || '', '.claude/projects/c--Users-daves-claude/memory/MEMORY.md');

  if (!syncUrl || !syncSecret) {
    console.error('Missing SYNC_URL or SYNC_SECRET environment variables');
    process.exit(1);
  }

  console.log(`Reading MEMORY.md from: ${memoryPath}`);
  const content = readFileSync(memoryPath, 'utf-8');
  const payloads = parseMemoryTodos(content);

  console.log(`Found ${payloads.length} projects with TODOs:`);
  for (const p of payloads) {
    console.log(`  ${p.project}: ${p.todos.length} items`);
  }

  const res = await fetch(`${syncUrl}/api/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sync-secret': syncSecret,
    },
    body: JSON.stringify(payloads),
  });

  if (!res.ok) {
    console.error(`Sync failed: ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error(body);
    process.exit(1);
  }

  const result = await res.json();
  console.log('Sync complete:', JSON.stringify(result, null, 2));
}

main();
