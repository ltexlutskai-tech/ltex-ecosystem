import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: { routeSheet: { findMany: vi.fn() } },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  getUnclosedMileageWarning,
  isUnclosedMileage,
} from "./route-sheet-mileage";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isUnclosedMileage", () => {
  it("flags non-completed sheet as unclosed", () => {
    expect(
      isUnclosedMileage({
        status: "dispatched",
        mileageStartKm: null,
        mileageEndKm: null,
      }),
    ).toBe(true);
  });

  it("flags completed sheet with start but no end mileage", () => {
    expect(
      isUnclosedMileage({
        status: "completed",
        mileageStartKm: 100,
        mileageEndKm: null,
      }),
    ).toBe(true);
  });

  it("does NOT flag completed sheet with both mileage values", () => {
    expect(
      isUnclosedMileage({
        status: "completed",
        mileageStartKm: 100,
        mileageEndKm: 150,
      }),
    ).toBe(false);
  });

  it("does NOT flag completed sheet with no mileage at all", () => {
    expect(
      isUnclosedMileage({
        status: "completed",
        mileageStartKm: null,
        mileageEndKm: null,
      }),
    ).toBe(false);
  });
});

describe("getUnclosedMileageWarning", () => {
  it("returns null when no expeditor assigned", async () => {
    const res = await getUnclosedMileageWarning(null, "rs1");
    expect(res).toBeNull();
    expect(mockPrisma.routeSheet.findMany).not.toHaveBeenCalled();
  });

  it("warns when another sheet of same expeditor is unclosed", async () => {
    mockPrisma.routeSheet.findMany.mockResolvedValueOnce([
      {
        id: "rs0",
        docNumber: 7,
        code1C: null,
        status: "dispatched",
        mileageStartKm: 100,
        mileageEndKm: null,
      },
    ]);
    const res = await getUnclosedMileageWarning("u1", "rs1");
    expect(res).toContain("Немає кінцевого кілометражу");
    expect(res).toContain("№7");
    // excludes the current sheet from the query
    const where = mockPrisma.routeSheet.findMany.mock.calls[0]?.[0].where;
    expect(where.id).toEqual({ not: "rs1" });
    expect(where.expeditorUserId).toBe("u1");
  });

  it("returns null when all other sheets are closed", async () => {
    mockPrisma.routeSheet.findMany.mockResolvedValueOnce([
      {
        id: "rs0",
        docNumber: 7,
        code1C: null,
        status: "completed",
        mileageStartKm: 100,
        mileageEndKm: 150,
      },
    ]);
    const res = await getUnclosedMileageWarning("u1", "rs1");
    expect(res).toBeNull();
  });

  it("returns null when expeditor has no other sheets", async () => {
    mockPrisma.routeSheet.findMany.mockResolvedValueOnce([]);
    const res = await getUnclosedMileageWarning("u1", "rs1");
    expect(res).toBeNull();
  });
});
