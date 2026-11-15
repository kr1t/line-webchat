/**
 * CSV for Excel: UTF-8 BOM (so Thai shows correctly), CRLF, quoted fields.
 * Cells starting with = + - @ (or tab/CR) are prefixed with ' so spreadsheets
 * do not run them as formulas (CSV injection).
 */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return '';
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
