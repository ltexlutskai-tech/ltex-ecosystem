import { describe, it, expect } from "vitest";
import { csvEscape, buildCsv } from "./csv-export";

describe("csvEscape", () => {
  it("повертає порожнє для null/undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
  it("просте число — UA-формат з ,", () => {
    expect(csvEscape(1234.56)).toBe("1234,56");
  });
  it("дата dd.mm.yyyy", () => {
    expect(csvEscape(new Date("2026-06-04T00:00:00Z"))).toMatch(
      /^\d{2}\.\d{2}\.\d{4}$/,
    );
  });
  it("рядок з ; обертається у лапки", () => {
    expect(csvEscape("a;b")).toBe('"a;b"');
  });
  it("подвійні лапки внутрі — escape", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
  it("новий рядок — обгортка у лапки", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildCsv", () => {
  it("починається з BOM + має header + рядки", () => {
    const csv = buildCsv(
      ["Назва", "Сума"],
      [
        ["Іван", 1000],
        ["Петро;ТОВ", 2500.5],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(csv).toContain("Назва;Сума");
    expect(csv).toContain("Іван;1000");
    expect(csv).toContain('"Петро;ТОВ";2500,5');
  });
});
