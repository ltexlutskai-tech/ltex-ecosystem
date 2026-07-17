import { describe, it, expect } from "vitest";
import {
  buildRouteSheetsWhere,
  normalizeRouteSheetStatus,
  serializeRouteSheetRow,
  type RawRouteSheetRow,
} from "./route-sheets-list";

describe("normalizeRouteSheetStatus", () => {
  it("accepts whitelisted, rejects garbage", () => {
    expect(normalizeRouteSheetStatus("dispatched")).toBe("dispatched");
    expect(normalizeRouteSheetStatus("completed")).toBe("completed");
    expect(normalizeRouteSheetStatus("nope")).toBe("");
    expect(normalizeRouteSheetStatus(undefined)).toBe("");
  });
});

describe("buildRouteSheetsWhere", () => {
  it("hides archived by default, lifts when archived=true", () => {
    expect(buildRouteSheetsWhere({}).archived).toBe(false);
    expect(buildRouteSheetsWhere({ archived: true }).archived).toBeUndefined();
  });

  it("builds OR over number1C / code1C / comment (route name) on search", () => {
    const where = buildRouteSheetsWhere({ search: "Луцьк" });
    expect(where.OR).toHaveLength(3);
    const json = JSON.stringify(where.OR);
    expect(json).toContain("number1C");
    expect(json).toContain("code1C");
    expect(json).toContain("comment");
  });

  it("adds numeric docNumber clause when search is a number (with optional №)", () => {
    const where = buildRouteSheetsWhere({ search: "№42" });
    const json = JSON.stringify(where.OR);
    expect(json).toContain('"docNumber":42');
  });

  it("applies status filter", () => {
    expect(buildRouteSheetsWhere({ status: "dispatched" }).status).toBe(
      "dispatched",
    );
    expect(buildRouteSheetsWhere({}).status).toBeUndefined();
  });

  it("applies date range over `date` field", () => {
    const from = new Date("2026-05-01");
    const to = new Date("2026-05-31");
    const where = buildRouteSheetsWhere({ from, to });
    expect(where.date).toEqual({ gte: from, lte: to });
  });

  it("no ownership scope when ownerUserId is absent (admin sees all)", () => {
    expect(buildRouteSheetsWhere({}).AND).toBeUndefined();
    expect(buildRouteSheetsWhere({ ownerUserId: null }).AND).toBeUndefined();
  });

  it("scopes to own (manager rejsu OR author) when ownerUserId is set", () => {
    const where = buildRouteSheetsWhere({ ownerUserId: "u1" });
    expect(where.AND).toEqual([
      { OR: [{ managerUserId: "u1" }, { createdByUserId: "u1" }] },
    ]);
  });

  it("ownership scope (AND) composes with search (OR)", () => {
    const where = buildRouteSheetsWhere({ search: "Луцьк", ownerUserId: "u1" });
    // search лишається у where.OR, власність — окремо у where.AND (обидві діють).
    expect(where.OR).toHaveLength(3);
    expect(where.AND).toEqual([
      { OR: [{ managerUserId: "u1" }, { createdByUserId: "u1" }] },
    ]);
  });
});

describe("serializeRouteSheetRow", () => {
  it("flattens row with routeName(=comment)/expeditor/orderCount", () => {
    const raw: RawRouteSheetRow = {
      id: "rs1",
      code1C: null,
      number1C: null,
      docNumber: 7,
      date: new Date("2026-05-20T10:00:00Z"),
      arrivalDate: null,
      status: "draft",
      totalUah: 4300,
      totalEur: 100,
      archived: false,
      comment: "11-12.02.26 Житомир-Вінниця",
      expeditor: { id: "u1", fullName: "Іван" },
      _count: { orders: 3 },
    };
    const row = serializeRouteSheetRow(raw);
    expect(row.docNumber).toBe(7);
    expect(row.orderCount).toBe(3);
    // «Маршрут» = вільнотекстовий comment.
    expect(row.routeName).toBe("11-12.02.26 Житомир-Вінниця");
    expect(row.expeditor?.fullName).toBe("Іван");
  });

  it("handles null routeName / expeditor", () => {
    const raw: RawRouteSheetRow = {
      id: "rs2",
      code1C: "RS-001",
      number1C: null,
      docNumber: 1,
      date: new Date(),
      arrivalDate: null,
      status: "completed",
      totalUah: 0,
      totalEur: 0,
      archived: true,
      comment: null,
      expeditor: null,
      _count: { orders: 0 },
    };
    const row = serializeRouteSheetRow(raw);
    expect(row.routeName).toBeNull();
    expect(row.expeditor).toBeNull();
    expect(row.orderCount).toBe(0);
  });
});
