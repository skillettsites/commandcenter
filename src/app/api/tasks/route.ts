import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/tasks?status=pending&project=carcostcheck
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const project = searchParams.get('project');

  let query = supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (project) query = query.eq('project', project);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/tasks
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project, description, priority } = body;

  if (!project || !description) {
    return NextResponse.json({ error: 'project and description are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project,
      description,
      priority: priority || 'medium',
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
