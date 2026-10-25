/**
 * Display formatting helpers (pure).
 * Dates are stored as yyyy-mm-dd and formatted WITHOUT going through the
 * Date/time-zone machinery, so "2026-09-01" is always shown as 01 Sep 2026.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-01" -> "01 Sep 2026". Unknown input is returned unchanged. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${m[3]} ${month} ${m[1]}` : iso;
}

/** "2026-09-01" -> "01 Sep" (for compact chart axes). */
export function formatShortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${m[3]} ${month}` : iso;
}

/** Whole days from a to b (b - a), both yyyy-mm-dd. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => {
    const [y, mo, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, mo - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Trims trailing zeros: 7.10 -> "7.1", 150 -> "150". */
export function formatNumber(n: number, maxDecimals = 1): string {
  return String(Number(n.toFixed(maxDecimals)));
}
