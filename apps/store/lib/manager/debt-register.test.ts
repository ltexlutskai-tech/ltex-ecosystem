import { describe, it, expect, vi, beforeEach } from "vitest";

import type { PrismaClient } from "@ltex/db";

import { recomputeDebtForClients } from "./debt-register";

// Фейковий prisma: лише методи, які торкає хелпер.
function makePrisma() {
  return {
    mgrClient: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
    mgrDebtMovement: {
      groupBy: vi.fn().mockResolvedValue([]),
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
});

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
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { debt: 150 },
    });
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { debt: -25.5 },
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
      data: { debt: 100 },
    });
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { debt: 0 },
    });
  });

  it("повний прогін (без clientIds) → спершу updateMany debt:0, потім суми", async () => {
    prisma.mgrDebtMovement.groupBy.mockResolvedValueOnce([
      { clientId: "c1", _sum: { amountEur: 42 } },
    ]);

    const updated = await recomputeDebtForClients(asPrisma(prisma));

    expect(prisma.mgrClient.updateMany).toHaveBeenCalledWith({
      data: { debt: 0 },
    });
    // groupBy без where-фільтра (усі клієнти).
    expect(prisma.mgrDebtMovement.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
    expect(prisma.mgrClient.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { debt: 42 },
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
      data: { debt: 10.01 },
    });
  });
});
