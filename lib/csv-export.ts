/**
 * Utility to export an array of objects to a downloadable CSV file.
 * Handles quoting and escaping of values.
 */

function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  headerMap?: Record<keyof T | string, string>
) {
  if (rows.length === 0) return;

  const keys = Object.keys(rows[0]) as (keyof T)[];
  const headers = keys.map((k) => (headerMap?.[k as string] ?? String(k)));

  const lines = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map((row) => keys.map((k) => escapeCSVValue(row[k])).join(",")),
  ];

  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
