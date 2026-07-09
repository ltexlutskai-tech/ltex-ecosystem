import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  mgrClient: { findUnique: vi.fn(), count: vi.fn() },
  mgrDebtMovement: { count: vi.fn() },
  order: { count: vi.fn(), findUnique: vi.fn() },
  sale: { count: vi.fn(), findUnique: vi.fn() },
  mgrCashOrder: { count: vi.fn(), findUnique: vi.fn() },
  mgrReminder: { count: vi.fn() },
  routeSheet: { findUnique: vi.fn() },
  mgrRoute: { findUnique: vi.fn() },
  mgrClientRouteAssignment: { count: vi.fn() },
  category: { findUnique: vi.fn(), count: vi.fn() },
  product: { findUnique: vi.fn(), count: vi.fn() },
  lot: { count: vi.fn() },
  orderItem: { count: vi.fn() },
  saleItem: { count: vi.fn() },
  receivingItem: { count: vi.fn() },
  cartItem: { count: vi.fn() },
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb }));

import { findReferences } from "./reference-check";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findReferences — client", () => {
  it("returns found=false when client missing", async () => {
    mockDb.mgrClient.findUnique.mockResolvedValue(null);
    const r = await findReferences("client", "missing");
    expect(r.found).toBe(false);
    expect(r.canHardDelete).toBe(false);
  });

  it("blocks hard delete for 1C client even with zero references", async () => {
    mockDb.mgrClient.findUnique.mockResolvedValue({
      code1C: "ABC123",
      phonePrimary: null,
    });
    mockDb.mgrDebtMovement.count.mockResolvedValue(0);
    const r = await findReferences("client", "c1");
    expect(r.found).toBe(true);
    expect(r.isHistorical1C).toBe(true);
    expect(r.canHardDelete).toBe(false);
    expect(r.blockers).toHaveLength(0);
  });

  it("allows hard delete for empty non-1C client", async () => {
    mockDb.mgrClient.findUnique.mockResolvedValue({
      code1C: null,
      phonePrimary: null,
    });
    mockDb.mgrDebtMovement.count.mockResolvedValue(0);
    const r = await findReferences("client", "c2");
    expect(r.found).toBe(true);
    expect(r.isHistorical1C).toBe(false);
    expect(r.canHardDelete).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it("blocks and lists debt-movement + document references", async () => {
    mockDb.mgrClient.findUnique.mockResolvedValue({
      code1C: null,
      phonePrimary: "+380501112233",
    });
    mockDb.mgrDebtMovement.count.mockResolvedValue(12);
    mockDb.order.count.mockResolvedValue(3);
    mockDb.sale.count.mockResolvedValue(0);
    mockDb.mgrCashOrder.count.mockResolvedValue(0);
    const r = await findReferences("client", "c3");
    expect(r.canHardDelete).toBe(false);
    const labels = r.blockers.map((b) => b.label);
    expect(labels).toContain("Рухи боргу");
    expect(labels).toContain("Замовлення");
    expect(r.blockers.find((b) => b.label === "Рухи боргу")?.count).toBe(12);
  });
});

describe("findReferences — order", () => {
  it("blocks when sale references the order", async () => {
    mockDb.order.findUnique.mockResolvedValue({ code1C: null });
    mockDb.sale.count.mockResolvedValue(1);
    mockDb.mgrReminder.count.mockResolvedValue(0);
    const r = await findReferences("order", "o1");
    expect(r.canHardDelete).toBe(false);
    expect(r.blockers[0]?.label).toContain("Реалізації");
  });

  it("allows delete for empty non-1C order", async () => {
    mockDb.order.findUnique.mockResolvedValue({ code1C: null });
    mockDb.sale.count.mockResolvedValue(0);
    mockDb.mgrReminder.count.mockResolvedValue(0);
    const r = await findReferences("order", "o2");
    expect(r.canHardDelete).toBe(true);
  });
});

describe("findReferences — dictionary (routes)", () => {
  it("blocks when clients use the route", async () => {
    mockDb.mgrRoute.findUnique.mockResolvedValue({ code1C: null });
    mockDb.mgrClient.count.mockResolvedValue(2);
    mockDb.mgrClientRouteAssignment.count.mockResolvedValue(1);
    const r = await findReferences("dictionary", "r1", "routes");
    expect(r.canHardDelete).toBe(false);
    expect(r.blockers[0]?.count).toBe(3);
  });
});
