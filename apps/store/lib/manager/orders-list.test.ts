import { describe, it, expect } from "vitest";
import {
  buildOrdersWhere,
  normalizeOrderStatus,
  serializeOrderRow,
  type RawOrderRow,
} from "./orders-list";

describe("normalizeOrderStatus", () => {
  it("accepts whitelisted status", () => {
    expect(normalizeOrderStatus("draft")).toBe("draft");
    expect(normalizeOrderStatus("posted")).toBe("posted");
  });

  it("ignores unknown / empty", () => {
    expect(normalizeOrderStatus("haxxor")).toBe("");
    expect(normalizeOrderStatus("")).toBe("");
    expect(normalizeOrderStatus(undefined)).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeOrderStatus("  sent  ")).toBe("sent");
  });
});

describe("buildOrdersWhere — ownership scope", () => {
  it("admin (null codes) → no customer scope", () => {
    const w = buildOrdersWhere({ customerCodes: null });
    expect(w.customer).toBeUndefined();
  });

  it("manager → scopes to own client codes", () => {
    const w = buildOrdersWhere({ customerCodes: ["000001", "000002"] });
    expect(w.customer).toEqual({ code1C: { in: ["000001", "000002"] } });
  });

  it("clientCode1C deeplink narrows to single code (manager)", () => {
    const w = buildOrdersWhere({
      customerCodes: ["000001", "000002"],
      clientCode1C: "000002",
    });
    expect(w.customer).toEqual({ code1C: "000002" });
  });

  it("clientCode1C deeplink works for admin too", () => {
    const w = buildOrdersWhere({ customerCodes: null, clientCode1C: "000009" });
    expect(w.customer).toEqual({ code1C: "000009" });
  });
});

describe("buildOrdersWhere — archived filter", () => {
  it("hides archived by default (archived = false)", () => {
    const w = buildOrdersWhere({ customerCodes: null });
    expect(w.archived).toBe(false);
  });

  it("showArchived=true removes archived constraint", () => {
    const w = buildOrdersWhere({ customerCodes: null, showArchived: true });
    expect(w.archived).toBeUndefined();
  });
});

describe("buildOrdersWhere — search (client + products)", () => {
  it("no OR when q empty / blank", () => {
    expect(buildOrdersWhere({ customerCodes: null }).OR).toBeUndefined();
    expect(
      buildOrdersWhere({ customerCodes: null, q: "   " }).OR,
    ).toBeUndefined();
  });

  it("builds OR over code1C, customer (name/phone/city) and product (name/articleCode)", () => {
    const w = buildOrdersWhere({ customerCodes: null, q: "Іванов" });
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toHaveLength(6);

    const json = JSON.stringify(w.OR);
    // № замовлення
    expect(json).toContain('"code1C"');
    // клієнт
    expect(json).toContain('"name"');
    expect(json).toContain('"phone"');
    expect(json).toContain('"city"');
    // товари у замовленні через items.some(product.*)
    expect(json).toContain('"items"');
    expect(json).toContain('"articleCode"');
    expect(json).toContain('"Іванов"');
  });

  it("matches products via items.some(product.name)", () => {
    const w = buildOrdersWhere({ customerCodes: null, q: "куртка" });
    const productNameClause = (w.OR ?? []).find(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        "items" in c &&
        JSON.stringify(c).includes('"name"'),
    );
    expect(productNameClause).toBeDefined();
    expect(JSON.stringify(productNameClause)).toContain('"some"');
  });

  it("trims search term", () => {
    const w = buildOrdersWhere({ customerCodes: null, q: "  abc  " });
    expect(JSON.stringify(w.OR)).toContain('"abc"');
    expect(JSON.stringify(w.OR)).not.toContain('"  abc  "');
  });
});

describe("buildOrdersWhere — status + date range", () => {
  it("applies status when present", () => {
    expect(
      buildOrdersWhere({ customerCodes: null, status: "sent" }).status,
    ).toBe("sent");
  });

  it("omits status when empty", () => {
    expect(
      buildOrdersWhere({ customerCodes: null, status: "" }).status,
    ).toBeUndefined();
  });

  it("applies date range (gte/lte)", () => {
    const from = new Date("2026-05-01");
    const to = new Date("2026-05-31");
    const w = buildOrdersWhere({ customerCodes: null, from, to });
    expect(w.createdAt).toEqual({ gte: from, lte: to });
  });

  it("applies only from", () => {
    const from = new Date("2026-05-01");
    const w = buildOrdersWhere({ customerCodes: null, from });
    expect(w.createdAt).toEqual({ gte: from });
  });
});

describe("serializeOrderRow", () => {
  const raw: RawOrderRow = {
    id: "ord1",
    code1C: "000000123",
    status: "posted",
    totalEur: 100,
    totalUah: 4300,
    archived: true,
    isActual: false,
    createdAt: new Date("2026-05-10T10:00:00Z"),
    customer: {
      id: "cust1",
      name: "Test Customer",
      code1C: "000001",
      city: "Луцьк",
    },
    _count: { items: 3 },
  };

  it("maps raw row to flat list item incl. city / isActual / archived / itemCount", () => {
    const row = serializeOrderRow(raw);
    expect(row.id).toBe("ord1");
    expect(row.customer.city).toBe("Луцьк");
    expect(row.isActual).toBe(false);
    expect(row.archived).toBe(true);
    expect(row.itemCount).toBe(3);
    expect(row.totalUah).toBe(4300);
  });

  it("tolerates null city", () => {
    const row = serializeOrderRow({
      ...raw,
      customer: { ...raw.customer, city: null },
    });
    expect(row.customer.city).toBeNull();
  });
});
