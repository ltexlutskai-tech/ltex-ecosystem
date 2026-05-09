import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    customer: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    order: {
      groupBy: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
  },
}));

import {
  listCustomers,
  buildCustomerWhere,
  CUSTOMER_LIST_PAGE_SIZE_DEFAULT,
} from "./admin-customers";
import { prisma } from "@ltex/db";

const mockFindMany = prisma.customer.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const mockCount = prisma.customer.count as unknown as ReturnType<typeof vi.fn>;
const mockGroupBy = prisma.order.groupBy as unknown as ReturnType<typeof vi.fn>;
const mockRaw = prisma.$queryRawUnsafe as unknown as ReturnType<typeof vi.fn>;

function makeCustomer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Customer ${id}`,
    phone: "+380501234567",
    email: null,
    telegram: null,
    city: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    _count: { orders: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCount.mockResolvedValue(0);
  mockFindMany.mockResolvedValue([]);
  mockGroupBy.mockResolvedValue([]);
  mockRaw.mockResolvedValue([]);
});

describe("buildCustomerWhere", () => {
  it("returns empty where for no filter", () => {
    expect(buildCustomerWhere({})).toEqual({});
  });

  it("hasOrders=true → orders.some", () => {
    expect(buildCustomerWhere({ hasOrders: true })).toMatchObject({
      orders: { some: {} },
    });
  });

  it("hasOrders=false → orders.none (leads only)", () => {
    expect(buildCustomerWhere({ hasOrders: false })).toMatchObject({
      orders: { none: {} },
    });
  });

  it("search adds OR clause across phone/name/email", () => {
    const where = buildCustomerWhere({ search: "+380" });
    expect(where.OR).toEqual([
      { phone: { contains: "+380", mode: "insensitive" } },
      { name: { contains: "+380", mode: "insensitive" } },
      { email: { contains: "+380", mode: "insensitive" } },
    ]);
  });

  it("trims whitespace from search input", () => {
    expect(buildCustomerWhere({ search: "   " })).toEqual({});
  });
});

describe("listCustomers", () => {
  it("без filter повертає всіх", async () => {
    mockCount.mockResolvedValue(2);
    mockFindMany.mockResolvedValue([
      makeCustomer("c1", { _count: { orders: 1 } }),
      makeCustomer("c2", { _count: { orders: 0 } }),
    ]);

    const result = await listCustomers();
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        skip: 0,
        take: CUSTOMER_LIST_PAGE_SIZE_DEFAULT,
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("hasOrders=true повертає тільки тих хто має >=1 Order", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([
      makeCustomer("c1", { _count: { orders: 3 } }),
    ]);

    await listCustomers({ hasOrders: true });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orders: { some: {} } },
      }),
    );
    expect(mockCount).toHaveBeenCalledWith({
      where: { orders: { some: {} } },
    });
  });

  it("hasOrders=false повертає тільки leads (0 Orders)", async () => {
    await listCustomers({ hasOrders: false });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orders: { none: {} } },
      }),
    );
  });

  it("search '+380' matches by phone substring", async () => {
    await listCustomers({ search: "+380" });

    const call = mockFindMany.mock.calls[0]![0];
    expect(call.where.OR).toEqual([
      { phone: { contains: "+380", mode: "insensitive" } },
      { name: { contains: "+380", mode: "insensitive" } },
      { email: { contains: "+380", mode: "insensitive" } },
    ]);
  });

  it("sort=orders_count_desc passes orderBy { orders: { _count: 'desc' } }", async () => {
    await listCustomers({ sort: "orders_count_desc" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { orders: { _count: "desc" } },
      }),
    );
  });

  it("sort=name_asc passes orderBy { name: 'asc' }", async () => {
    await listCustomers({ sort: "name_asc" });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { name: "asc" },
      }),
    );
  });

  it("pagination shape: page=2, pageSize=25 → skip=25, take=25", async () => {
    await listCustomers({ page: 2, pageSize: 25 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
  });

  it("merges ordersTotalUah and lastOrderAt from groupBy aggregates", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([
      makeCustomer("c1", { _count: { orders: 2 } }),
    ]);
    mockGroupBy
      .mockResolvedValueOnce([{ customerId: "c1", _sum: { totalUah: 4500 } }])
      .mockResolvedValueOnce([
        {
          customerId: "c1",
          _max: { createdAt: new Date("2026-05-01T12:00:00Z") },
        },
      ]);

    const result = await listCustomers();

    expect(result.items[0]!.ordersTotalUah).toBe(4500);
    expect(result.items[0]!.lastOrderAt).toEqual(
      new Date("2026-05-01T12:00:00Z"),
    );
    // Verify cancelled orders are excluded from sum
    expect(mockGroupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: "cancelled" },
        }),
        _sum: { totalUah: true },
      }),
    );
  });

  it("sort=last_order_desc uses raw query for ordering", async () => {
    mockCount.mockResolvedValue(1);
    mockRaw.mockResolvedValue([{ id: "c1" }]);
    mockFindMany.mockResolvedValue([
      makeCustomer("c1", { _count: { orders: 1 } }),
    ]);

    const result = await listCustomers({ sort: "last_order_desc" });

    expect(mockRaw).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    // findMany called for hydration without orderBy/skip/take (id-based)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["c1"] } },
      }),
    );
  });

  it("returns empty items when no customers match", async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await listCustomers({ hasOrders: false });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(mockGroupBy).not.toHaveBeenCalled();
  });

  it("falls back to 0 totalUah when no aggregate row exists for a customer", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([
      makeCustomer("c1", { _count: { orders: 0 } }),
    ]);
    // no aggregates returned (lead with no orders)
    mockGroupBy.mockResolvedValue([]);

    const result = await listCustomers();
    expect(result.items[0]!.ordersTotalUah).toBe(0);
    expect(result.items[0]!.lastOrderAt).toBeNull();
  });
});
