import { describe, it, expect } from "vitest";
import {
  buildCashOrdersWhere,
  normalizeCashOrderType,
  serializeCashOrderRow,
  type RawCashOrderRow,
} from "./cash-orders-list";

describe("normalizeCashOrderType", () => {
  it("accepts income/expense, rejects anything else", () => {
    expect(normalizeCashOrderType("income")).toBe("income");
    expect(normalizeCashOrderType("expense")).toBe("expense");
    expect(normalizeCashOrderType("haxxor")).toBeUndefined();
    expect(normalizeCashOrderType(undefined)).toBeUndefined();
    expect(normalizeCashOrderType("  income  ")).toBe("income");
  });
});

describe("buildCashOrdersWhere", () => {
  it("admin scope (null) → no ownership filter, archived hidden by default", () => {
    const w = buildCashOrdersWhere({ scope: null });
    expect(w.AND).toBeUndefined();
    expect(w.archived).toBe(false);
  });

  it("manager scope → ownership via customer OR sale.customer", () => {
    const w = buildCashOrdersWhere({ scope: ["000001", "000002"] });
    const and = w.AND as Array<{ OR?: unknown[] }>;
    expect(Array.isArray(and)).toBe(true);
    expect(and[0]?.OR).toHaveLength(2);
    expect(and[0]?.OR?.[0]).toEqual({
      customer: { code1C: { in: ["000001", "000002"] } },
    });
    expect(and[0]?.OR?.[1]).toEqual({
      sale: { customer: { code1C: { in: ["000001", "000002"] } } },
    });
  });

  it("archived=true removes the archived=false filter", () => {
    const w = buildCashOrdersWhere({ scope: null, archived: true });
    expect(w.archived).toBeUndefined();
  });

  it("type filter applied", () => {
    expect(buildCashOrdersWhere({ scope: null, type: "expense" }).type).toBe(
      "expense",
    );
  });

  it("date range filters paidAt with gte/lte", () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    const w = buildCashOrdersWhere({ scope: null, from, to });
    expect(w.paidAt).toEqual({ gte: from, lte: to });
  });

  it("numeric search matches docNumber + customer name (direct + via sale)", () => {
    const w = buildCashOrdersWhere({ scope: null, search: "№42" });
    const and = w.AND as Array<{ OR?: Array<Record<string, unknown>> }>;
    const or = and[0]?.OR ?? [];
    expect(or.some((c) => "docNumber" in c && c.docNumber === 42)).toBe(true);
    expect(or.some((c) => "customer" in c)).toBe(true);
    expect(or.some((c) => "sale" in c)).toBe(true);
  });

  it("non-numeric search does NOT add docNumber clause", () => {
    const w = buildCashOrdersWhere({ scope: null, search: "Іван" });
    const and = w.AND as Array<{ OR?: Array<Record<string, unknown>> }>;
    const or = and[0]?.OR ?? [];
    expect(or.some((c) => "docNumber" in c)).toBe(false);
  });

  it("per-column client filter → customer.name contains (insensitive)", () => {
    const w = buildCashOrdersWhere({ scope: null, client: "  Іван  " });
    expect(w.customer).toEqual({
      name: { contains: "Іван", mode: "insensitive" },
    });
  });

  it("per-column article filter → cashFlowArticleRef.name contains", () => {
    const w = buildCashOrdersWhere({ scope: null, article: "Прихід" });
    expect(w.cashFlowArticleRef).toEqual({
      name: { contains: "Прихід", mode: "insensitive" },
    });
  });

  it("per-column account filter → bankAccountRef.name contains", () => {
    const w = buildCashOrdersWhere({ scope: null, account: "ПриватБанк" });
    expect(w.bankAccountRef).toEqual({
      name: { contains: "ПриватБанк", mode: "insensitive" },
    });
  });

  it("blank per-column filters are ignored", () => {
    const w = buildCashOrdersWhere({
      scope: null,
      client: "   ",
      article: "",
      account: "  ",
    });
    expect(w.customer).toBeUndefined();
    expect(w.cashFlowArticleRef).toBeUndefined();
    expect(w.bankAccountRef).toBeUndefined();
  });
});

describe("serializeCashOrderRow", () => {
  const base: RawCashOrderRow = {
    id: "co1",
    code1C: null,
    number1C: null,
    docNumber: 7,
    type: "income",
    status: "posted",
    documentSumEur: 123.45,
    archived: false,
    paidAt: new Date("2026-05-01"),
    saleId: null,
    customer: { id: "c1", name: "Іван", code1C: "000001" },
    sale: null,
    bankAccountRef: { id: "ba1", name: "ПриватБанк" },
    cashFlowArticleRef: { id: "cf1", name: "Оплата покупця" },
  };

  it("prefers direct customer over sale.customer", () => {
    const row = serializeCashOrderRow(base);
    expect(row.customerName).toBe("Іван");
    expect(row.customerId).toBe("c1");
    expect(row.bankAccountName).toBe("ПриватБанк");
    expect(row.cashFlowArticleName).toBe("Оплата покупця");
  });

  it("falls back to sale.customer when no direct customer", () => {
    const row = serializeCashOrderRow({
      ...base,
      customer: null,
      sale: {
        id: "s1",
        customer: { id: "c2", name: "Петро", code1C: "000002" },
      },
    });
    expect(row.customerName).toBe("Петро");
    expect(row.customerId).toBe("c2");
  });

  it("renders dashes when no customer + no refs", () => {
    const row = serializeCashOrderRow({
      ...base,
      customer: null,
      sale: null,
      bankAccountRef: null,
      cashFlowArticleRef: null,
    });
    expect(row.customerName).toBe("—");
    expect(row.customerId).toBeNull();
    expect(row.bankAccountName).toBeNull();
    expect(row.cashFlowArticleName).toBeNull();
  });
});
