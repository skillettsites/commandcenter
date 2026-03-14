import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { SyncPayload } from '@/lib/types';

// POST /api/sync
// Accepts an array of project TODO lists and syncs them to Supabase
// Used by Claude Code after updating MEMORY.md
// This is a full replace: tasks in Supabase not in the payload get removed
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: SyncPayload[] = await request.json();
  const supabase = getServiceClient();
  const results: { project: string; added: number; updated: number; removed: number }[] = [];

  // Merge payloads for the same project (e.g. "general" appears twice)
  const merged = new Map<string, SyncPayload>();
  for (const payload of body) {
    const existing = merged.get(payload.project);
    if (existing) {
      existing.todos.push(...payload.todos);
    } else {
      merged.set(payload.project, { ...payload, todos: [...payload.todos] });
    }
  }

  for (const [, payload] of merged) {
    let added = 0;
    let updated = 0;
    let removed = 0;

    // Get existing tasks for this project
    const { data: existing } = await supabase
      .from('tasks')
      .select('id, description, status')
      .eq('project', payload.project);

    const existingMap = new Map(
      (existing || []).map(t => [t.description.toLowerCase().trim(), t])
    );

    // Track which existing tasks are still in MEMORY.md
    const matchedIds = new Set<string>();

    for (const todo of payload.todos) {
      const key = todo.description.toLowerCase().trim();
      const match = existingMap.get(key);

      if (match) {
        matchedIds.add(match.id);
        // Update status if changed
        const newStatus = todo.status === 'done' ? 'done' : 'pending';
        if (match.status !== newStatus) {
          await supabase
            .from('tasks')
            .update({
              status: newStatus,
              completed_at: newStatus === 'done' ? new Date().toISOString() : null,
            })
            .eq('id', match.id);
          updated++;
        }
      } else {
        // Only insert pending tasks (skip done items from MEMORY.md)
        if (todo.status !== 'done') {
          await supabase
            .from('tasks')
            .insert({
              project: payload.project,
              description: todo.description,
              status: 'pending',
              priority: 'medium',
            });
          added++;
        }
      }
    }

    // Remove tasks that are no longer in MEMORY.md
    for (const task of (existing || [])) {
      if (!matchedIds.has(task.id)) {
        await supabase.from('tasks').delete().eq('id', task.id);
        removed++;
      }
    }

    results.push({ project: payload.project, added, updated, removed });
  }

  return NextResponse.json({ synced: results });
}
