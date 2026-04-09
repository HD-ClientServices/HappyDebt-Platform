/**
 * Format a USD amount for display in dashboard cards and tables.
 *
 * Handles the sloppy inputs the UI code throws at us gracefully:
 *   - `null` / `undefined` / empty string  → `"—"`
 *   - A numeric string (`"1234.56"`) or actual number
 *   - `NaN` / `Infinity`                   → `"—"`
 *
 * @example
 *   formatUSD(1234567)               // "$1,234,567"
 *   formatUSD(1234567, { compact: true })  // "$1.2M"
 *   formatUSD(null)                  // "—"
 *   formatUSD("42")                  // "$42"
 *   formatUSD(undefined)             // "—"
 *
 * Use `compact: true` for KPI cards where horizontal space is tight
 * (shows "$1.2M" instead of "$1,234,567"). Leave it off for table
 * rows where the user needs exact figures for double-checking against
 * GHL.
 */
export function formatUSD(
  amount: number | string | null | undefined,
  opts: { compact?: boolean } = {}
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(n);
}
