import { describe, it, expect } from "vitest";
import {
  formatRegDate,
  formatRegDateTime,
  buildStockNormWhere,
  mapStockNormToRow,
  buildStatusHistoryWhere,
  mapStatusHistoryToRow,
  buildDayLogWhere,
  dayLogKindLabel,
  mapDayLogToRow,
} from "./misc-register-view";

describe("misc-register-view: formatters", () => {
  it("formatRegDate повертає ДД.ММ.РРРР", () => {
    expect(formatRegDate("2026-06-17T10:00:00.000Z")).toBe("17.06.2026");
  });

  it("formatRegDate повертає порожнє для null/невалідного", () => {
    expect(formatRegDate(null)).toBe("");
    expect(formatRegDate("not-a-date")).toBe("");
  });

  it("formatRegDateTime містить час", () => {
    const out = formatRegDateTime("2026-06-17T08:30:00.000Z");
    expect(out).toContain("2026");
    expect(out).toMatch(/\d{2}:\d{2}/);
  });
});

describe("misc-register-view: stock norms", () => {
  it("buildStockNormWhere порожній без пошуку", () => {
    expect(buildStockNormWhere({})).toEqual({});
  });

  it("buildStockNormWhere фільтрує за productCode1C contains", () => {
    expect(buildStockNormWhere({ q: " ab12 " })).toEqual({
      productCode1C: { contains: "ab12" },
    });
  });

  it("mapStockNormToRow підставляє — для null складу", () => {
    const row = mapStockNormToRow({
      id: "n1",
      productCode1C: "deadbeef",
      warehouseCode1C: null,
      norm: 12.5,
      setAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(row).toMatchObject({
      id: "n1",
      productCode1C: "deadbeef",
      warehouseCode1C: "—",
      norm: "12.5",
    });
    expect(row.setAt).toContain("2026-01-02");
  });
});

describe("misc-register-view: status history", () => {
  it("buildStatusHistoryWhere з пошуком + діапазоном дат", () => {
    const where = buildStatusHistoryWhere({
      q: "cli1",
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(where.clientCode1C).toEqual({ contains: "cli1" });
    const range = where.changedAt as { gte: Date; lte: Date };
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lte).toBeInstanceOf(Date);
    // верхня межа включно по кінець доби
    expect(range.lte.getHours()).toBe(23);
  });

  it("buildStatusHistoryWhere порожній без параметрів", () => {
    expect(buildStatusHistoryWhere({})).toEqual({});
  });

  it("mapStatusHistoryToRow підставляє — для null статусів", () => {
    const row = mapStatusHistoryToRow({
      id: "h1",
      clientCode1C: "abc",
      statusCode1C: null,
      operationalStatus: null,
      changedAt: new Date("2026-03-04T00:00:00.000Z"),
    });
    expect(row).toMatchObject({
      id: "h1",
      clientCode1C: "abc",
      statusCode1C: "—",
      operationalStatus: "—",
    });
  });
});

describe("misc-register-view: agent day log", () => {
  it("dayLogKindLabel мапить start/end", () => {
    expect(dayLogKindLabel("start")).toBe("Початок дня");
    expect(dayLogKindLabel("end")).toBe("Кінець дня");
    expect(dayLogKindLabel("other")).toBe("other");
  });

  it("buildDayLogWhere фільтрує kind лише для start/end", () => {
    expect(buildDayLogWhere({ kind: "start" })).toMatchObject({
      kind: "start",
    });
    // невалідний kind ігнорується
    expect(buildDayLogWhere({ kind: "bogus" }).kind).toBeUndefined();
  });

  it("buildDayLogWhere пошук за code1C + дата-діапазон", () => {
    const where = buildDayLogWhere({ q: "ag9", from: "2026-02-01" });
    expect(where.code1C).toEqual({ contains: "ag9" });
    const range = where.date as { gte: Date };
    expect(range.gte).toBeInstanceOf(Date);
  });

  it("mapDayLogToRow резолвить ім'я агента з мапи, інакше code1C/—", () => {
    const names = new Map([["u1", "Петренко Іван"]]);
    const matched = mapDayLogToRow(
      {
        id: "d1",
        userId: "u1",
        code1C: "hex1",
        kind: "start",
        at: new Date("2026-05-01T07:00:00.000Z"),
        date: new Date("2026-05-01T00:00:00.000Z"),
        note: null,
      },
      names,
    );
    expect(matched.agentName).toBe("Петренко Іван");
    expect(matched.kindLabel).toBe("Початок дня");
    expect(matched.note).toBe("");

    const fallbackCode = mapDayLogToRow(
      {
        id: "d2",
        userId: null,
        code1C: "hexX",
        kind: "end",
        at: new Date("2026-05-01T18:00:00.000Z"),
        date: new Date("2026-05-01T00:00:00.000Z"),
        note: "пізно",
      },
      names,
    );
    expect(fallbackCode.agentName).toBe("hexX");
    expect(fallbackCode.kindLabel).toBe("Кінець дня");
    expect(fallbackCode.note).toBe("пізно");
  });
});
