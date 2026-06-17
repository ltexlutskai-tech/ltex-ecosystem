import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildXlsx } from "./xlsx-export";

/** Хелпер: розпарсити згенерований буфер назад у workbook. */
async function readBack(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

/** Перший аркуш workbook (з перевіркою наявності). */
function firstSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Workbook не має аркушів");
  return sheet;
}

describe("buildXlsx", () => {
  it("повертає непорожній Buffer", async () => {
    const buf = await buildXlsx(["Назва", "Сума"], [["Іван", 1000]]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("перший рядок — заголовки (жирні)", async () => {
    const buf = await buildXlsx(["Клієнт", "Виручка €"], [["ТОВ", 50]]);
    const wb = await readBack(buf);
    const sheet = firstSheet(wb);
    const headerRow = sheet.getRow(1);
    expect(headerRow.getCell(1).value).toBe("Клієнт");
    expect(headerRow.getCell(2).value).toBe("Виручка €");
    expect(headerRow.getCell(1).font?.bold).toBe(true);
  });

  it("числові колонки зберігаються як числа, текст — як текст", async () => {
    const buf = await buildXlsx(["Назва", "Сума"], [["Петро", 2500.5]]);
    const wb = await readBack(buf);
    const sheet = firstSheet(wb);
    const dataRow = sheet.getRow(2);
    expect(dataRow.getCell(1).value).toBe("Петро");
    expect(dataRow.getCell(2).value).toBe(2500.5);
    expect(typeof dataRow.getCell(2).value).toBe("number");
  });

  it("дата зберігається як Date з форматом dd.mm.yyyy", async () => {
    const d = new Date("2026-06-17T00:00:00Z");
    const buf = await buildXlsx(["Дата"], [[d]]);
    const wb = await readBack(buf);
    const cell = firstSheet(wb).getRow(2).getCell(1);
    expect(cell.value).toBeInstanceOf(Date);
    expect(cell.numFmt).toBe("dd.mm.yyyy");
  });

  it("порожній набір рядків — лише заголовок", async () => {
    const buf = await buildXlsx(["A", "B"], []);
    const wb = await readBack(buf);
    const sheet = firstSheet(wb);
    // rowCount = 1 (тільки заголовок)
    expect(sheet.rowCount).toBe(1);
    expect(sheet.getRow(1).getCell(1).value).toBe("A");
  });

  it("null / undefined клітинки стають порожніми", async () => {
    const buf = await buildXlsx(["X", "Y"], [[null, undefined]]);
    const wb = await readBack(buf);
    const dataRow = firstSheet(wb).getRow(2);
    expect(dataRow.getCell(1).value).toBeNull();
    expect(dataRow.getCell(2).value).toBeNull();
  });

  it("назва аркуша санітизується (заборонені символи + cap 31)", async () => {
    const longName = "Звіт/по*клієнтах[2026]: дуже-дуже довга назва аркуша";
    const buf = await buildXlsx(["A"], [["x"]], longName);
    const wb = await readBack(buf);
    const name = firstSheet(wb).name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[:\\/?*[\]]/);
  });

  it("приймає колонки у форматі об'єктів { header }", async () => {
    const buf = await buildXlsx(
      [{ header: "Контрагент" }, { header: "Борг €" }],
      [["ФОП", 12.5]],
    );
    const wb = await readBack(buf);
    const sheet = firstSheet(wb);
    expect(sheet.getRow(1).getCell(1).value).toBe("Контрагент");
    expect(sheet.getRow(2).getCell(2).value).toBe(12.5);
  });
});
