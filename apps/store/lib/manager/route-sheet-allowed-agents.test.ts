import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  routeSheet: { findUnique: vi.fn() },
  routeSheetOrder: { findMany: vi.fn() },
  order: { findMany: vi.fn() },
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb, Prisma: {} }));
vi.mock("@/lib/manager/lot-booking", () => ({
  isActiveReservation: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/manager/order-pricing", () => ({ unitPriceForType: () => 5 }));

import { getRouteSheetAllowedAgents } from "./route-sheet-loading";

beforeEach(() => vi.clearAllMocks());

describe("getRouteSheetAllowedAgents", () => {
  it("вказаний менеджер → лише його бронь «своя» (без запиту замовлень)", async () => {
    mockDb.routeSheet.findUnique.mockResolvedValueOnce({
      managerUserId: "m1",
      expeditorUserId: "e1",
      createdByUserId: "c1",
    });
    const set = await getRouteSheetAllowedAgents("rs1");
    expect([...set]).toEqual(["m1"]);
    expect(mockDb.routeSheetOrder.findMany).not.toHaveBeenCalled();
  });

  it("без менеджера → fallback: експедитор + автор + агенти замовлень", async () => {
    mockDb.routeSheet.findUnique.mockResolvedValueOnce({
      managerUserId: null,
      expeditorUserId: "e1",
      createdByUserId: "c1",
    });
    mockDb.routeSheetOrder.findMany.mockResolvedValueOnce([{ orderId: "o1" }]);
    mockDb.order.findMany.mockResolvedValueOnce([
      { assignedAgentUserId: "a1" },
    ]);
    const set = await getRouteSheetAllowedAgents("rs1");
    expect([...set].sort()).toEqual(["a1", "c1", "e1"]);
  });
});
