import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@ltex/db";
import {
  deleteAbandonedDrafts,
  draftCutoffDate,
  isEmptyDraft,
} from "./cleanup-drafts";

describe("isEmptyDraft (класифікація порожньої чернетки)", () => {
  it("документ з рядками: порожній лише коли 0 рядків", () => {
    expect(isEmptyDraft({ itemCount: 0 })).toBe(true);
    expect(isEmptyDraft({ itemCount: 1 })).toBe(false);
    expect(isEmptyDraft({ itemCount: 5 })).toBe(false);
  });

  it("шапковий документ: порожній коли немає ключових полів", () => {
    expect(isEmptyDraft({ hasKeyData: false })).toBe(true);
    expect(isEmptyDraft({ hasKeyData: true })).toBe(false);
  });

  it("itemCount має пріоритет над hasKeyData", () => {
    expect(isEmptyDraft({ itemCount: 2, hasKeyData: false })).toBe(false);
  });

  it("порожній вхід трактується як порожня чернетка", () => {
    expect(isEmptyDraft({})).toBe(true);
  });
});

describe("draftCutoffDate", () => {
  it("віднімає N днів від now", () => {
    const now = new Date("2026-07-15T00:00:00.000Z");
    const cutoff = draftCutoffDate(now, 14);
    expect(cutoff.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("deleteAbandonedDrafts", () => {
  function makeDb() {
    const delegate = () => ({
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    });
    return {
      sale: delegate(),
      order: delegate(),
      receiving: delegate(),
      productReturnFromCustomer: delegate(),
      warehouseReturn: delegate(),
      returnToSupplier: delegate(),
      repacking: delegate(),
      writeOff: delegate(),
      stockAdjustment: delegate(),
      inventory: delegate(),
      stockTransfer: delegate(),
      bagStateChange: delegate(),
      routeSheet: delegate(),
      mgrCashOrder: delegate(),
      bankPaymentIncoming: delegate(),
      bankPaymentOutgoing: delegate(),
      cashTransfer: delegate(),
    };
  }

  it("викликає deleteMany на кожній моделі та підсумовує total", async () => {
    const db = makeDb();
    const now = new Date("2026-07-15T00:00:00.000Z");
    const counts = await deleteAbandonedDrafts(
      db as unknown as PrismaClient,
      14,
      now,
    );

    // 17 моделей × count=1 → total 17.
    expect(counts.total).toBe(17);
    expect(counts.sale).toBe(1);
    expect(counts.routeSheet).toBe(1);
    expect(counts.mgrCashOrder).toBe(1);
    expect(db.sale.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.cashTransfer.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("документи з рядками фільтрують status=draft + updatedAt<cutoff + items none", async () => {
    const db = makeDb();
    const now = new Date("2026-07-15T00:00:00.000Z");
    await deleteAbandonedDrafts(db as unknown as PrismaClient, 14, now);

    const where = db.sale.deleteMany.mock.calls[0]?.[0]?.where as {
      status: string;
      updatedAt: { lt: Date };
      items: { none: Record<string, unknown> };
    };
    expect(where.status).toBe("draft");
    expect(where.updatedAt.lt.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(where.items).toEqual({ none: {} });
  });

  it("шапковий mgrCashOrder фільтрує порожні поля/суми", async () => {
    const db = makeDb();
    await deleteAbandonedDrafts(db as unknown as PrismaClient, 14);

    const where = db.mgrCashOrder.deleteMany.mock.calls[0]?.[0]?.where as {
      saleId: null;
      customerId: null;
      amountUah: number;
    };
    expect(where.saleId).toBeNull();
    expect(where.customerId).toBeNull();
    expect(where.amountUah).toBe(0);
  });

  it("routeSheet фільтрує немає замовлень і немає рядків", async () => {
    const db = makeDb();
    await deleteAbandonedDrafts(db as unknown as PrismaClient, 14);
    const where = db.routeSheet.deleteMany.mock.calls[0]?.[0]?.where as {
      orders: { none: Record<string, unknown> };
      items: { none: Record<string, unknown> };
    };
    expect(where.orders).toEqual({ none: {} });
    expect(where.items).toEqual({ none: {} });
  });
});
