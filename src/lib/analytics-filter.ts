// Dates to exclude from all analytics charts and aggregates.
//
// GA occasionally records huge one-day bot floods (near-100% Direct, 1-3s
// sessions, single geo) that dwarf real traffic and wreck every chart's scale.
// Listing the date here drops it from the time-series and the derived totals so
// the charts reflect real visitors. Add future bot-flood dates to this set.
//
// Format: 'YYYYMMDD' (matches GA's `date` dimension; also matches the first 8
// chars of the `dateHour` dimension 'YYYYMMDDHH').
export const EXCLUDED_ANOMALY_DATES = new Set<string>([
  '20260716', // 10,104 fake Direct sessions in one day (bot flood)
]);

/**
 * True if a GA `date` (YYYYMMDD) or `dateHour` (YYYYMMDDHH) key falls on an
 * excluded bot-anomaly day.
 */
export function isExcludedDate(dateKey: string): boolean {
  if (!dateKey) return false;
  return EXCLUDED_ANOMALY_DATES.has(dateKey.slice(0, 8));
}
