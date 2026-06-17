import { describe, it, expect } from "vitest";
import {
  buildDebtWhere,
  mapDebtMovementToRow,
  isDebtKind,
  type DebtMovementRaw,
} from "./debt-register-view";

describe("buildDebtWhere", () => {
  it("порожній вхід → порожній where", () => {
    expect(buildDebtWhere({})).toEqual({});
  });

  it("період from/to ставить occurredAt gte/lte (lte = кінець дня)", () => {
    const where = buildDebtWhere({ from: "2026-01-01", to: "2026-01-31" });
    const occurredAt = where.occurredAt as { gte?: Date; lte?: Date };
    expect(occurredAt.gte).toBeInstanceOf(Date);
    expect(occurredAt.lte).toBeInstanceOf(Date);
    expect(occurredAt.lte?.getHours()).toBe(23);
    expect(occurredAt.lte?.getMinutes()).toBe(59);
  });

  it("clientId має пріоритет над пошуком q", () => {
    const where = buildDebtWhere({ clientId: "c1", q: "Іван" });
    expect(where.clientId).toBe("c1");
    expect(where.client).toBeUndefined();
  });

  it("q без clientId → contains по імені клієнта (insensitive)", () => {
    const where = buildDebtWhere({ q: "  Іван  " });
    expect(where.clientId).toBeUndefined();
    expect(where.client).toEqual({
      name: { contains: "Іван", mode: "insensitive" },
    });
  });

  it("валідний kind застосовується, невалідний — ігнорується", () => {
    expect(buildDebtWhere({ kind: "sale" }).kind).toBe("sale");
    expect(buildDebtWhere({ kind: "bogus" }).kind).toBeUndefined();
  });

  it("невалідні дати ігноруються", () => {
    expect(buildDebtWhere({ from: "not-a-date" }).occurredAt).toBeUndefined();
  });
});

describe("isDebtKind", () => {
  it("розпізнає валідні види", () => {
    expect(isDebtKind("payment")).toBe(true);
    expect(isDebtKind("xxx")).toBe(false);
  });
});

describe("mapDebtMovementToRow", () => {
  const base: DebtMovementRaw = {
    id: "m1",
    clientId: "c1",
    occurredAt: new Date("2026-02-01T10:00:00.000Z"),
    amountEur: 123.45,
    kind: "sale",
    sourceType: "sale",
    note: "test",
    client: { id: "c1", name: "Іван" },
  };

  it("маппить базові поля + лейбли", () => {
    const row = mapDebtMovementToRow(base);
    expect(row.id).toBe("m1");
    expect(row.clientId).toBe("c1");
    expect(row.clientName).toBe("Іван");
    expect(row.amountEur).toBe(123.45);
    expect(row.kindLabel).toBe("Реалізація");
    expect(row.sourceLabel).toBe("Реалізація");
  });

  it("null-клієнт та null-нотатка → плейсхолдери", () => {
    const row = mapDebtMovementToRow({
      ...base,
      client: null,
      note: null,
      sourceType: null,
    });
    expect(row.clientName).toBe("—");
    expect(row.note).toBe("—");
    expect(row.sourceLabel).toBe("—");
    expect(row.clientId).toBeNull();
  });

  it("невідомий kind лишається як є", () => {
    const row = mapDebtMovementToRow({ ...base, kind: "weird" });
    expect(row.kindLabel).toBe("weird");
  });
});
