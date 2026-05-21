import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClient: { findUnique: vi.fn() },
    customer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import {
  resolveCustomerForOrder,
  ResolveCustomerError,
} from "./resolve-customer";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveCustomerForOrder", () => {
  it("резолвить MgrClient.id → існуючий Customer за code1C", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      code1C: "000001",
      name: "ТОВ Тест",
      phonePrimary: "+380501112233",
      city: "Луцьк",
    });
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "cust-existing",
      code1C: "000001",
      name: "ТОВ Тест",
    });

    const r = await resolveCustomerForOrder("mgr-1");
    expect(r.id).toBe("cust-existing");
    expect(r.code1C).toBe("000001");
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("створює новий Customer коли по code1C нічого немає", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      code1C: "000002",
      name: "Новий клієнт",
      phonePrimary: "+380671234567",
      city: "Рівне",
    });
    // findUnique по code1C → null (немає Customer)
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);
    mockPrisma.customer.create.mockResolvedValueOnce({
      id: "cust-new",
      code1C: "000002",
      name: "Новий клієнт",
    });

    const r = await resolveCustomerForOrder("mgr-2");
    expect(r.id).toBe("cust-new");
    expect(mockPrisma.customer.create).toHaveBeenCalledOnce();
    const arg = mockPrisma.customer.create.mock.calls[0]?.[0] as {
      data: { name: string; code1C: string; phone: string; city: string };
    };
    expect(arg.data.code1C).toBe("000002");
    expect(arg.data.name).toBe("Новий клієнт");
    expect(arg.data.phone).toBe("+380671234567");
    expect(arg.data.city).toBe("Рівне");
  });

  it("без code1C — find-or-create за телефоном (повертає існуючий)", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      code1C: null,
      name: "Без коду",
      phonePrimary: "+380990001122",
      city: null,
    });
    mockPrisma.customer.findFirst.mockResolvedValueOnce({
      id: "cust-by-phone",
      code1C: null,
      name: "Без коду",
    });

    const r = await resolveCustomerForOrder("mgr-3");
    expect(r.id).toBe("cust-by-phone");
    expect(mockPrisma.customer.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("MgrClient без code1C і без телефону → зрозуміла помилка 400", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      code1C: null,
      name: "Сирий клієнт",
      phonePrimary: null,
      city: null,
    });

    await expect(resolveCustomerForOrder("mgr-4")).rejects.toMatchObject({
      status: 400,
    });
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("fallback: rawClientId = Customer.id (deeplink ?clientId=)", async () => {
    // не MgrClient → пробуємо як Customer.id
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    mockPrisma.customer.findUnique.mockResolvedValueOnce({
      id: "cust-direct",
      code1C: "000009",
      name: "Прямий Customer",
    });

    const r = await resolveCustomerForOrder("cust-direct");
    expect(r.id).toBe("cust-direct");
    expect(r.code1C).toBe("000009");
  });

  it("ні MgrClient, ні Customer не знайдено → 404", async () => {
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce(null);
    mockPrisma.customer.findUnique.mockResolvedValueOnce(null);

    await expect(resolveCustomerForOrder("ghost")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("порожній id → ResolveCustomerError 400", async () => {
    await expect(resolveCustomerForOrder("   ")).rejects.toBeInstanceOf(
      ResolveCustomerError,
    );
    expect(mockPrisma.mgrClient.findUnique).not.toHaveBeenCalled();
  });
});
