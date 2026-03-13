import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { SyncPayload } from '@/lib/types';

// POST /api/sync
// Accepts an array of project TODO lists and syncs them to Supabase
// Used by Claude Code after updating MEMORY.md
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-sync-secret');
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: SyncPayload[] = await request.json();
  const supabase = getServiceClient();
  const results: { project: string; added: number; updated: number }[] = [];

  for (const payload of body) {
    let added = 0;
    let updated = 0;

    // Get existing tasks for this project
    const { data: existing } = await supabase
      .from('tasks')
      .select('id, description, status')
      .eq('project', payload.project);

    const existingMap = new Map(
      (existing || []).map(t => [t.description.toLowerCase().trim(), t])
    );

    for (const todo of payload.todos) {
      const key = todo.description.toLowerCase().trim();
      const match = existingMap.get(key);

      if (match) {
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
        // Insert new task
        await supabase
          .from('tasks')
          .insert({
            project: payload.project,
            description: todo.description,
            status: todo.status === 'done' ? 'done' : 'pending',
            priority: 'medium',
            completed_at: todo.status === 'done' ? new Date().toISOString() : null,
          });
        added++;
      }
    }

    results.push({ project: payload.project, added, updated });
  }

  return NextResponse.json({ synced: results });
}
