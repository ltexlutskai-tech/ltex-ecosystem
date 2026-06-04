/**
 * CSV-helpers для звітів Analyst-кабінету (← Тиждень 5 блоку Ролі).
 *
 * Excel нативно відкриває CSV з BOM-маркером UTF-8. Завдяки цьому український
 * текст відображається коректно у будь-якій версії Excel/LibreOffice.
 *
 * Формат значень:
 *   - рядки беруться у подвійні лапки, внутрішні `"` подвоюються;
 *   - числа форматуються через `,` як десятковий розділювач (UA-локаль);
 *   - дати — у форматі `dd.mm.yyyy`.
 */

export type CsvValue = string | number | Date | null | undefined;

export function csvEscape(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatDate(v);
  if (typeof v === "number") {
    return v.toLocaleString("uk-UA", { useGrouping: false }).replace(".", ",");
  }
  const s = String(v);
  if (/[",;\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const sep = ";";
  const lines: string[] = [];
  lines.push(headers.map(csvEscape).join(sep));
  for (const r of rows) {
    lines.push(r.map(csvEscape).join(sep));
  }
  // BOM (﻿) щоб Excel розпізнав UTF-8.
  return "﻿" + lines.join("\r\n");
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
