import { NextRequest, NextResponse } from 'next/server';
import { searchEmails, batchModifyEmails, batchTrashEmails } from '@/lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { action, query } = await request.json();

  if (!action || !query) {
    return NextResponse.json({ error: 'Missing action or query' }, { status: 400 });
  }

  // Find matching email IDs
  const ids = await searchEmails(query, 5000);
  if (ids.length === 0) {
    return NextResponse.json({ found: 0, action, success: true });
  }

  let success = false;
  switch (action) {
    case 'archive':
      // Remove from inbox, mark as read
      success = await batchModifyEmails(ids, [], ['INBOX', 'UNREAD']);
      break;
    case 'trash':
      success = await batchTrashEmails(ids);
      break;
    case 'read':
      // Just mark as read
      success = await batchModifyEmails(ids, [], ['UNREAD']);
      break;
    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  return NextResponse.json({ found: ids.length, action, success });
}
