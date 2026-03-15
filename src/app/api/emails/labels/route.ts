import { NextRequest, NextResponse } from 'next/server';
import { getLabels, getLabelDetails, getEmailsByLabel } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const labelId = request.nextUrl.searchParams.get('labelId');

  // If labelId provided, return emails for that label
  if (labelId) {
    const [result, details] = await Promise.all([
      getEmailsByLabel(labelId, 15),
      getLabelDetails(labelId),
    ]);
    return NextResponse.json({
      ...result,
      label: details,
    });
  }

  // Otherwise return all user labels with counts
  const labels = await getLabels();

  // Fetch details (message counts) for each label in parallel
  const detailed = await Promise.all(
    labels.map(async (label) => {
      const details = await getLabelDetails(label.id);
      return {
        id: label.id,
        name: label.name,
        messagesTotal: details?.messagesTotal || 0,
        messagesUnread: details?.messagesUnread || 0,
      };
    })
  );

  // Sort by total messages descending, filter out empty labels
  const sorted = detailed
    .filter(l => l.messagesTotal > 0)
    .sort((a, b) => b.messagesTotal - a.messagesTotal);

  return NextResponse.json({ labels: sorted, connected: labels.length > 0 || detailed.length > 0 });
}
