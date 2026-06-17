/**
 * XLSX-генератор для звітів менеджерки (← Фаза 7 повного паритету з 1С).
 *
 * Доповнює `csv-export.ts`: той самий shape даних (`headers` + `rows`), але на
 * виході — справжній `.xlsx` (OpenXML), який Excel/LibreOffice відкривають без
 * перетворень кодувань і без здогадок про роздільники.
 *
 * Особливості:
 *   - числові клітинки записуються як числа (right-aligned, формат `#,##0.##`),
 *     рядки — як текст; дати — як `dd.mm.yyyy`;
 *   - рядок заголовків — жирний, з легкою заливкою + freeze-pane (закріплення);
 *   - колонки авто-розширюються під найдовше значення (з розумним cap-ом).
 *
 * Бібліотека `exceljs` обрана замість SheetJS (`xlsx`): остання у npm-версії
 * має невиправлені high-CVE (prototype-pollution / ReDoS), тоді як `exceljs`
 * чистий за `pnpm audit --prod`.
 */

import ExcelJS from "exceljs";

export type XlsxValue = string | number | Date | null | undefined;

/** Опис однієї колонки XLSX-аркуша. */
export interface XlsxColumn {
  /** Заголовок колонки (укр). */
  header: string;
}

const HEADER_FILL = "FFE8F5E9"; // легкий emerald-50
const MAX_COL_WIDTH = 60;
const MIN_COL_WIDTH = 8;

/**
 * Формує XLSX-файл з табличних даних і повертає його як Node `Buffer`.
 *
 * @param columns  заголовки колонок (порядок = порядок клітинок у `rows`)
 * @param rows     рядки даних; кожен елемент — масив значень по колонках
 * @param sheetName назва аркуша (Excel обмежує 31 символом — обрізається)
 */
export async function buildXlsx(
  columns: readonly (XlsxColumn | string)[],
  rows: readonly XlsxValue[][],
  sheetName = "Звіт",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "L-TEX";
  workbook.created = new Date();

  const safeSheetName = sanitizeSheetName(sheetName);
  const sheet = workbook.addWorksheet(safeSheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = columns.map((c) => (typeof c === "string" ? c : c.header));

  // ─── Заголовок ───────────────────────────────────────────────────────────
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
  });

  // ─── Дані ────────────────────────────────────────────────────────────────
  for (const row of rows) {
    const dataRow = sheet.addRow(headers.map((_, i) => toCellValue(row[i])));
    for (let i = 0; i < headers.length; i++) {
      const cell = dataRow.getCell(i + 1);
      const raw = row[i];
      if (typeof raw === "number") {
        cell.numFmt = "#,##0.##";
        cell.alignment = { horizontal: "right" };
      } else if (raw instanceof Date) {
        cell.numFmt = "dd.mm.yyyy";
      }
    }
  }

  // ─── Ширина колонок (авто, з cap-ом) ───────────────────────────────────────
  for (let i = 0; i < headers.length; i++) {
    let maxLen = (headers[i] ?? "").length;
    for (const row of rows) {
      const len = displayLength(row[i]);
      if (len > maxLen) maxLen = len;
    }
    const col = sheet.getColumn(i + 1);
    col.width = Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxLen + 2));
  }

  // exceljs повертає ArrayBuffer-сумісний тип — приводимо до Node Buffer.
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/** Excel забороняє у назві аркуша `: \ / ? * [ ]` і довжину > 31. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  const safe = cleaned.length > 0 ? cleaned : "Звіт";
  return safe.slice(0, 31);
}

/** Готує значення для запису у клітинку (Date/number — як є, інше — текст). */
function toCellValue(v: XlsxValue): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return v;
  return String(v);
}

/** Довжина відображення значення (для авто-ширини колонки). */
function displayLength(v: XlsxValue): number {
  if (v === null || v === undefined) return 0;
  if (v instanceof Date) return 10; // dd.mm.yyyy
  return String(v).length;
}
