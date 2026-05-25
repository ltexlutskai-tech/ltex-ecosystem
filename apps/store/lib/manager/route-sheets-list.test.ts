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

  it("builds OR over code1C / comment / route name on search", () => {
    const where = buildRouteSheetsWhere({ search: "Луцьк" });
    expect(where.OR).toHaveLength(3);
    const json = JSON.stringify(where.OR);
    expect(json).toContain("code1C");
    expect(json).toContain("comment");
    expect(json).toContain("route");
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
});

describe("serializeRouteSheetRow", () => {
  it("flattens row with route/expeditor/orderCount", () => {
    const raw: RawRouteSheetRow = {
      id: "rs1",
      code1C: null,
      docNumber: 7,
      date: new Date("2026-05-20T10:00:00Z"),
      arrivalDate: null,
      status: "draft",
      totalUah: 4300,
      totalEur: 100,
      archived: false,
      route: { id: "r1", name: "Луцьк-Центр" },
      expeditor: { id: "u1", fullName: "Іван" },
      _count: { orders: 3 },
    };
    const row = serializeRouteSheetRow(raw);
    expect(row.docNumber).toBe(7);
    expect(row.orderCount).toBe(3);
    expect(row.route?.name).toBe("Луцьк-Центр");
    expect(row.expeditor?.fullName).toBe("Іван");
  });

  it("handles null route / expeditor", () => {
    const raw: RawRouteSheetRow = {
      id: "rs2",
      code1C: "RS-001",
      docNumber: 1,
      date: new Date(),
      arrivalDate: null,
      status: "completed",
      totalUah: 0,
      totalEur: 0,
      archived: true,
      route: null,
      expeditor: null,
      _count: { orders: 0 },
    };
    const row = serializeRouteSheetRow(raw);
    expect(row.route).toBeNull();
    expect(row.expeditor).toBeNull();
    expect(row.orderCount).toBe(0);
  });
});
