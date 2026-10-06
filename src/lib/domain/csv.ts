/**
 * Secure CSV field formatting with formula injection mitigation
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val);

  // Guard against spreadsheet formula injection (CSV Injection / CWE-1236)
  if (FORMULA_PREFIXES.some(prefix => str.startsWith(prefix))) {
    str = `'${str}`;
  }

  // Escape double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function formatCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

export function generateCsv(headers: string[], rows: unknown[][]): string {
  const headerRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
  const dataRows = rows.map(formatCsvRow);
  return [headerRow, ...dataRows].join('\r\n');
}
