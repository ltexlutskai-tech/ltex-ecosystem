import { describe, it, expect, vi, beforeEach } from "vitest";

import type { PrismaClient } from "@ltex/db";

// Мок singleton-prisma з @ltex/db, який використовує applyDebtMovementSafe.
// vi.hoisted — щоб mockDb був доступний у hoisted-фабриці vi.mock.
const mockDb = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  mgrClient: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  mgrDebtMovement: {
    groupBy: vi.fn(),
    upsert: vi.fn(),
  },
}));
vi.mock("@ltex/db", () => ({ prisma: mockDb }));

import {
  recomputeDebtForClients,
  resolveClientIdByCustomer,
  applyDebtMovementSafe,
  applyDebtMovementTx,
} from "./debt-register";

// Фейковий prisma: лише методи, які торкає хелпер.
function makePrisma() {
  return {
    customer: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    mgrClient: {
      findUnique: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    mgrDebtMovement: {
      groupBy: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
}

type FakePrisma = ReturnType<typeof makePrisma>;

function asPrisma(p: FakePrisma): PrismaClient {
  return p as unknown as PrismaClient;
}

let prisma: FakePrisma;

beforeEach(() => {
  vi.clearAllMocks();
  prisma = makePrisma();
  mockDb.customer.findUnique.mockResolvedValue(null);
  mockDb.mgrClient.findUnique.mockResolvedValue(null);
  mockDb.mgrClient.updateMany.mockResolvedValue({ count: 0 });
  mockDb.mgrClient.update.mockResolvedValue({});
  mockDb.mgrDebtMovement.groupBy.mockResolvedValue([]);
  mockDb.mgrDebtMovement.upsert.mockResolvedValue({});
});

/** Чекає, поки fire-and-forget (void async IIFE) добіжить. */
async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("recomputeDebtForClients", () => {
  it("groupBy суми → mgrClient.update викликається з правильним debt", async () => {
    prisma.mgrDebtMovement.groupBy.mockResolvedValueOnce([
      { clientId: "c1", _sum: { amountEur: 150 } },
      { clientId: "c2", _sum: { amountEur: -25.5 } },
    ]);

    const updated = await recomputeDebtForClients(asPrisma(prisma), [
      "c1",
      "c2",
    ]);

    expect(updated).toBe(2);
    // overdueDebt=0 бо другий (overdue) groupBy повертає [] за замовчуванням.
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { debt: 150, overdueDebt: 0 },
    });
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { debt: -25.5, overdueDebt: 0 },
    });
    // Точкова перебудова НЕ обнуляє всіх через updateMany.
    expect(prisma.mgrClient.updateMany).not.toHaveBeenCalled();
  });

  it("клієнт без рухів при заданих clientIds → debt:0", async () => {
    // c1 має рух, c2 — ні (немає у groupBy).
    prisma.mgrDebtMovement.groupBy.mockResolvedValueOnce([
      { clientId: "c1", _sum: { amountEur: 100 } },
    ]);

    const updated = await recomputeDebtForClients(asPrisma(prisma), [
      "c1",
      "c2",
    ]);

    expect(updated).toBe(2);
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { debt: 100, overdueDebt: 0 },
    });
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { debt: 0, overdueDebt: 0 },
    });
  });

  it("повний прогін (без clientIds) → спершу updateMany debt:0, потім суми", async () => {
    prisma.mgrDebtMovement.groupBy.mockResolvedValueOnce([
      { clientId: "c1", _sum: { amountEur: 42 } },
    ]);

    const updated = await recomputeDebtForClients(asPrisma(prisma));

    expect(prisma.mgrClient.updateMany).toHaveBeenCalledWith({
      data: { debt: 0, overdueDebt: 0 },
    });
    // Основний groupBy — без where-фільтра (усі клієнти).
    expect(prisma.mgrDebtMovement.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { debt: 42, overdueDebt: 0 },
    });
    expect(updated).toBe(1);
  });

  it("порожній clientIds → no-op (0 оновлень, без запитів)", async () => {
    const updated = await recomputeDebtForClients(asPrisma(prisma), []);
    expect(updated).toBe(0);
    expect(prisma.mgrClient.updateMany).not.toHaveBeenCalled();
    expect(prisma.mgrDebtMovement.groupBy).not.toHaveBeenCalled();
    expect(prisma.mgrClient.update).not.toHaveBeenCalled();
  });

  it("Decimal-сума округлюється до 2 знаків", async () => {
    prisma.mgrDebtMovement.groupBy.mockResolvedValueOnce([
      { clientId: "c1", _sum: { amountEur: 10.005 } },
    ]);
    await recomputeDebtForClients(asPrisma(prisma), ["c1"]);
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { debt: 10.01, overdueDebt: 0 },
    });
  });

  describe("overdueDebt (прострочений борг)", () => {
    it("overdue=0 коли всі рухи свіжі (немає старих за поріг)", async () => {
      prisma.mgrDebtMovement.groupBy
        // Основний groupBy: поточний борг = 100.
        .mockResolvedValueOnce([{ clientId: "c1", _sum: { amountEur: 100 } }])
        // Overdue groupBy (occurredAt < поріг): порожньо → історичний баланс 0.
        .mockResolvedValueOnce([]);

      await recomputeDebtForClients(asPrisma(prisma), ["c1"]);

      expect(prisma.mgrClient.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { debt: 100, overdueDebt: 0 },
      });
    });

    it("overdue>0 коли є старий непокритий борг", async () => {
      prisma.mgrDebtMovement.groupBy
        .mockResolvedValueOnce([{ clientId: "c1", _sum: { amountEur: 100 } }])
        // Історичний баланс на момент порогу = 100 (старий непокритий борг).
        .mockResolvedValueOnce([{ clientId: "c1", _sum: { amountEur: 100 } }]);

      await recomputeDebtForClients(asPrisma(prisma), ["c1"]);

      expect(prisma.mgrClient.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { debt: 100, overdueDebt: 100 },
      });
    });

    it("свіжа оплата зменшує overdue (min з поточним боргом)", async () => {
      prisma.mgrDebtMovement.groupBy
        // Поточний борг = 60 (старий 100 мінус свіжа оплата 40).
        .mockResolvedValueOnce([{ clientId: "c1", _sum: { amountEur: 60 } }])
        // Історичний баланс на момент порогу = 100 (свіжа оплата ще після порогу).
        .mockResolvedValueOnce([{ clientId: "c1", _sum: { amountEur: 100 } }]);

      await recomputeDebtForClients(asPrisma(prisma), ["c1"]);

      // overdue = min(60, 100) = 60.
      expect(prisma.mgrClient.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { debt: 60, overdueDebt: 60 },
      });
    });

    it("повне гасіння старого боргу → overdue=0 (min(0,100))", async () => {
      prisma.mgrDebtMovement.groupBy
        .mockResolvedValueOnce([{ clientId: "c1", _sum: { amountEur: 0 } }])
        .mockResolvedValueOnce([{ clientId: "c1", _sum: { amountEur: 100 } }]);

      await recomputeDebtForClients(asPrisma(prisma), ["c1"]);

      expect(prisma.mgrClient.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { debt: 0, overdueDebt: 0 },
      });
    });
  });
});

describe("resolveClientIdByCustomer", () => {
  it("customer з code1C і існуючим MgrClient → id", async () => {
    prisma.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC123" });
    prisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "mgr-1" });

    const id = await resolveClientIdByCustomer(asPrisma(prisma), "cust-1");

    expect(id).toBe("mgr-1");
    expect(prisma.mgrClient.findUnique).toHaveBeenCalledWith({
      where: { code1C: "ABC123" },
      select: { id: true },
    });
  });

  it("customer без code1C → null (MgrClient не шукається)", async () => {
    prisma.customer.findUnique.mockResolvedValueOnce({ code1C: null });

    const id = await resolveClientIdByCustomer(asPrisma(prisma), "cust-1");

    expect(id).toBeNull();
    expect(prisma.mgrClient.findUnique).not.toHaveBeenCalled();
  });

  it("MgrClient не знайдено за code1C → null", async () => {
    prisma.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC123" });
    prisma.mgrClient.findUnique.mockResolvedValueOnce(null);

    const id = await resolveClientIdByCustomer(asPrisma(prisma), "cust-1");

    expect(id).toBeNull();
  });
});

describe("applyDebtMovementSafe", () => {
  it("клієнт резолвиться → upsert з правильним знаком + recompute", async () => {
    mockDb.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC123" });
    mockDb.mgrClient.findUnique.mockResolvedValueOnce({ id: "mgr-1" });

    const occurredAt = new Date("2026-06-16T10:00:00Z");
    applyDebtMovementSafe({
      customerId: "cust-1",
      amountEur: -150.014, // round2 → -150.01
      kind: "payment",
      sourceType: "cash_order",
      sourceId: "co-1",
      occurredAt,
      note: "Оплата (касовий ордер)",
      createdByUserId: "user-1",
    });

    await flush();

    expect(mockDb.mgrDebtMovement.upsert).toHaveBeenCalledWith({
      where: {
        mgr_debt_movement_source: {
          kind: "payment",
          sourceType: "cash_order",
          sourceId: "co-1",
        },
      },
      create: {
        clientId: "mgr-1",
        amountEur: -150.01, // round2 (знак збережено)
        kind: "payment",
        sourceType: "cash_order",
        sourceId: "co-1",
        occurredAt,
        note: "Оплата (касовий ордер)",
        createdByUserId: "user-1",
      },
      update: { amountEur: -150.01, clientId: "mgr-1" },
    });
    // recomputeDebtForClients([clientId]) → groupBy для цього клієнта.
    expect(mockDb.mgrDebtMovement.groupBy).toHaveBeenCalled();
  });

  it("клієнт null → upsert НЕ викликано, не кидає", async () => {
    mockDb.customer.findUnique.mockResolvedValueOnce({ code1C: null });

    expect(() =>
      applyDebtMovementSafe({
        customerId: "cust-x",
        amountEur: 99,
        kind: "sale",
        sourceType: "sale",
        sourceId: "sale-1",
        occurredAt: new Date(),
      }),
    ).not.toThrow();

    await flush();

    expect(mockDb.mgrDebtMovement.upsert).not.toHaveBeenCalled();
    expect(mockDb.mgrDebtMovement.groupBy).not.toHaveBeenCalled();
  });

  it("помилка upsert ковтається (fire-and-forget не кидає)", async () => {
    mockDb.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC123" });
    mockDb.mgrClient.findUnique.mockResolvedValueOnce({ id: "mgr-1" });
    mockDb.mgrDebtMovement.upsert.mockRejectedValueOnce(new Error("db down"));

    expect(() =>
      applyDebtMovementSafe({
        customerId: "cust-1",
        amountEur: 10,
        kind: "sale",
        sourceType: "sale",
        sourceId: "sale-2",
        occurredAt: new Date(),
      }),
    ).not.toThrow();

    await flush();
    // recompute не дійшов через помилку upsert.
    expect(mockDb.mgrDebtMovement.groupBy).not.toHaveBeenCalled();
  });
});

describe("applyDebtMovementTx", () => {
  it("резолвить клієнта → upsert руху у tx + повертає clientId (без recompute)", async () => {
    prisma.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC123" });
    prisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "mgr-1" });

    const occurredAt = new Date("2026-06-16T10:00:00Z");
    const clientId = await applyDebtMovementTx(asPrisma(prisma), {
      customerId: "cust-1",
      amountEur: 150.014, // round2 → 150.01
      kind: "sale",
      sourceType: "sale",
      sourceId: "sale-1",
      occurredAt,
      note: "Реалізація проведена",
      createdByUserId: "user-1",
    });

    expect(clientId).toBe("mgr-1");
    expect(prisma.mgrDebtMovement.upsert).toHaveBeenCalledWith({
      where: {
        mgr_debt_movement_source: {
          kind: "sale",
          sourceType: "sale",
          sourceId: "sale-1",
        },
      },
      create: {
        clientId: "mgr-1",
        amountEur: 150.01,
        kind: "sale",
        sourceType: "sale",
        sourceId: "sale-1",
        occurredAt,
        note: "Реалізація проведена",
        createdByUserId: "user-1",
      },
      update: { amountEur: 150.01, clientId: "mgr-1" },
    });
    // Кеш перераховують ПІСЛЯ коміту — не тут.
    expect(prisma.mgrDebtMovement.groupBy).not.toHaveBeenCalled();
    expect(prisma.mgrClient.update).not.toHaveBeenCalled();
  });

  it("клієнт не резолвиться → null, upsert НЕ викликано", async () => {
    prisma.customer.findUnique.mockResolvedValueOnce({ code1C: null });

    const clientId = await applyDebtMovementTx(asPrisma(prisma), {
      customerId: "cust-x",
      amountEur: 99,
      kind: "sale",
      sourceType: "sale",
      sourceId: "sale-2",
      occurredAt: new Date(),
    });

    expect(clientId).toBeNull();
    expect(prisma.mgrDebtMovement.upsert).not.toHaveBeenCalled();
  });

  it("КИДАЄ, якщо upsert падає (відкат транзакції документа)", async () => {
    prisma.customer.findUnique.mockResolvedValueOnce({ code1C: "ABC123" });
    prisma.mgrClient.findUnique.mockResolvedValueOnce({ id: "mgr-1" });
    prisma.mgrDebtMovement.upsert.mockRejectedValueOnce(new Error("db down"));

    await expect(
      applyDebtMovementTx(asPrisma(prisma), {
        customerId: "cust-1",
        amountEur: 10,
        kind: "sale",
        sourceType: "sale",
        sourceId: "sale-3",
        occurredAt: new Date(),
      }),
    ).rejects.toThrow("db down");
  });
});
