/**
 * UK timezone helpers.
 * The dashboard owner is UK-based, so "today" means midnight in Europe/London (GMT/BST).
 */

/** Returns the start of "today" in Europe/London as an ISO string (UTC). */
export function ukTodayStart(): string {
  const now = new Date();
  // Format in Europe/London to get the local date
  const ukDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
  // Parse back as midnight in UK time, then convert to UTC
  const ukMidnight = new Date(`${ukDate}T00:00:00+01:00`); // BST
  // Check if we're actually in GMT (winter) or BST (summer)
  const jan = new Date(`${ukDate.slice(0, 4)}-01-15T12:00:00Z`);
  const jul = new Date(`${ukDate.slice(0, 4)}-07-15T12:00:00Z`);
  const janOffset = getUKOffset(jan);
  const currentOffset = getUKOffset(now);
  // Use the actual current UK offset
  const offsetHours = currentOffset;
  const midnight = new Date(`${ukDate}T00:00:00.000Z`);
  midnight.setUTCHours(midnight.getUTCHours() - offsetHours);
  return midnight.toISOString();
}

/** Returns the start of the current month in Europe/London as an ISO string (UTC). */
export function ukMonthStart(): string {
  const now = new Date();
  const ukDate = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const monthStr = ukDate.slice(0, 7) + '-01';
  const offsetHours = getUKOffset(new Date(`${monthStr}T12:00:00Z`));
  const midnight = new Date(`${monthStr}T00:00:00.000Z`);
  midnight.setUTCHours(midnight.getUTCHours() - offsetHours);
  return midnight.toISOString();
}

/** Returns today's date string (YYYY-MM-DD) in UK timezone. */
export function ukTodayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

/** Returns current month string (YYYY-MM) in UK timezone. */
export function ukMonthStr(): string {
  return ukTodayStr().slice(0, 7);
}

/** Returns the UK offset in hours (0 for GMT, 1 for BST). */
function getUKOffset(date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const ukStr = date.toLocaleString('en-US', { timeZone: 'Europe/London' });
  const utcDate = new Date(utcStr);
  const ukDate = new Date(ukStr);
  return Math.round((ukDate.getTime() - utcDate.getTime()) / 3600000);
}
