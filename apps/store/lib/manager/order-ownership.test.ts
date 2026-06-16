import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findMany: vi.fn() },
    order: { findUnique: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { canViewOrder, getMyClientCodes1C } from "./order-ownership";

const ADMIN = { id: "admin1", role: "admin" as const };
const OWNER = { id: "owner1", role: "owner" as const };
const ANALYST = { id: "an1", role: "analyst" as const };
const MANAGER = { id: "m1", role: "manager" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMyClientCodes1C", () => {
  it("returns null for admin (no restriction)", async () => {
    const out = await getMyClientCodes1C(ADMIN);
    expect(out).toBeNull();
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("returns null for owner (no restriction)", async () => {
    const out = await getMyClientCodes1C(OWNER);
    expect(out).toBeNull();
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("returns null for analyst (all clients — forms «Потреби» manually)", async () => {
    const out = await getMyClientCodes1C(ANALYST);
    expect(out).toBeNull();
    expect(mockPrisma.mgrClient.findMany).not.toHaveBeenCalled();
  });

  it("returns array of code1Cs for manager", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { code1C: "000001" },
      { code1C: "000002" },
    ]);
    const out = await getMyClientCodes1C(MANAGER);
    expect(out).toEqual(["000001", "000002"]);
  });

  it("returns empty array for manager with no assignments", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    const out = await getMyClientCodes1C(MANAGER);
    expect(out).toEqual([]);
  });

  it("filters out clients with null code1C", async () => {
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { code1C: "000001" },
      { code1C: null },
      { code1C: "000003" },
    ]);
    const out = await getMyClientCodes1C(MANAGER);
    expect(out).toEqual(["000001", "000003"]);
  });
});

describe("canViewOrder", () => {
  it("admin can always view", async () => {
    const ok = await canViewOrder(ADMIN, "ord1");
    expect(ok).toBe(true);
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("analyst can always view", async () => {
    const ok = await canViewOrder(ANALYST, "ord1");
    expect(ok).toBe(true);
    expect(mockPrisma.order.findUnique).not.toHaveBeenCalled();
  });

  it("returns false when order not found", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce(null);
    const ok = await canViewOrder(MANAGER, "ord1");
    expect(ok).toBe(false);
  });

  it("returns false when order.customer.code1C is null", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      customer: { code1C: null },
    });
    const ok = await canViewOrder(MANAGER, "ord1");
    expect(ok).toBe(false);
  });

  it("returns true when manager owns the client", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      customer: { code1C: "000001" },
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { code1C: "000001" },
      { code1C: "000002" },
    ]);
    const ok = await canViewOrder(MANAGER, "ord1");
    expect(ok).toBe(true);
  });

  it("returns false when manager does not own the client", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      customer: { code1C: "000099" },
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    const ok = await canViewOrder(MANAGER, "ord1");
    expect(ok).toBe(false);
  });

  it("returns false when manager has 0 assignments", async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({
      customer: { code1C: "000001" },
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    const ok = await canViewOrder(MANAGER, "ord1");
    expect(ok).toBe(false);
  });
});
