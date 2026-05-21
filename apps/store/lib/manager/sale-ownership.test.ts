import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findMany: vi.fn() },
    sale: { findUnique: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { canViewSale, getMyClientCodes1C } from "./sale-ownership";

const ADMIN = { id: "admin1", role: "admin" as const };
const MANAGER = { id: "m1", role: "manager" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMyClientCodes1C (re-exported from order-ownership)", () => {
  it("returns null for admin (no restriction)", async () => {
    const out = await getMyClientCodes1C(ADMIN);
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
});

describe("canViewSale", () => {
  it("admin can always view", async () => {
    const ok = await canViewSale(ADMIN, "sale1");
    expect(ok).toBe(true);
    expect(mockPrisma.sale.findUnique).not.toHaveBeenCalled();
  });

  it("returns false when sale not found", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(null);
    const ok = await canViewSale(MANAGER, "sale1");
    expect(ok).toBe(false);
  });

  it("returns false when sale.customer.code1C is null", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      customer: { code1C: null },
    });
    const ok = await canViewSale(MANAGER, "sale1");
    expect(ok).toBe(false);
  });

  it("returns true when manager owns the client", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      customer: { code1C: "000001" },
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([
      { code1C: "000001" },
      { code1C: "000002" },
    ]);
    const ok = await canViewSale(MANAGER, "sale1");
    expect(ok).toBe(true);
  });

  it("returns false when manager does not own the client", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      customer: { code1C: "000099" },
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([{ code1C: "000001" }]);
    const ok = await canViewSale(MANAGER, "sale1");
    expect(ok).toBe(false);
  });

  it("returns false when manager has 0 assignments", async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce({
      customer: { code1C: "000001" },
    });
    mockPrisma.mgrClient.findMany.mockResolvedValueOnce([]);
    const ok = await canViewSale(MANAGER, "sale1");
    expect(ok).toBe(false);
  });
});
