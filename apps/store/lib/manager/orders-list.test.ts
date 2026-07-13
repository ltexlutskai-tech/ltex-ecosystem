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
    expect(normalizeOrderStatus("  not_posted  ")).toBe("not_posted");
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

  it("manager + viewerUserId → OR(own code1C, assigned agent) via AND (7.2 Block 2)", () => {
    const w = buildOrdersWhere({
      customerCodes: ["000001"],
      viewerUserId: "u1",
    });
    expect(w.customer).toBeUndefined();
    expect(w.AND).toEqual([
      {
        OR: [
          { customer: { code1C: { in: ["000001"] } } },
          { assignedAgentUserId: "u1" },
        ],
      },
    ]);
  });

  it("viewerUserId ignored for admin (null codes)", () => {
    const w = buildOrdersWhere({ customerCodes: null, viewerUserId: "u1" });
    expect(w.AND).toBeUndefined();
    expect(w.customer).toBeUndefined();
  });

  it("viewerUserId + deeplink → single code1C, no agent OR", () => {
    const w = buildOrdersWhere({
      customerCodes: ["000001"],
      viewerUserId: "u1",
      clientCode1C: "000001",
    });
    expect(w.AND).toBeUndefined();
    expect(w.customer).toEqual({ code1C: "000001" });
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

describe("buildOrdersWhere — actuality filter", () => {
  it("defaults to actual (isActual = true)", () => {
    const w = buildOrdersWhere({ customerCodes: null });
    expect(w.isActual).toBe(true);
  });

  it("inactive → isActual = false", () => {
    const w = buildOrdersWhere({ customerCodes: null, actuality: "inactive" });
    expect(w.isActual).toBe(false);
  });

  it("all → no isActual constraint", () => {
    const w = buildOrdersWhere({ customerCodes: null, actuality: "all" });
    expect(w.isActual).toBeUndefined();
  });
});

describe("buildOrdersWhere — source filter (7.2 Block 1)", () => {
  it("no source → no constraint", () => {
    expect(buildOrdersWhere({ customerCodes: null }).source).toBeUndefined();
  });

  it("site → source = 'site'", () => {
    const w = buildOrdersWhere({ customerCodes: null, source: "site" });
    expect(w.source).toBe("site");
  });

  it("manual → source ≠ 'site'", () => {
    const w = buildOrdersWhere({ customerCodes: null, source: "manual" });
    expect(w.source).toEqual({ not: "site" });
  });
});

describe("buildOrdersWhere — per-column filters", () => {
  it("clientName → customer.name contains", () => {
    const w = buildOrdersWhere({ customerCodes: null, clientName: "Іван" });
    expect(w.customer).toEqual({
      name: { contains: "Іван", mode: "insensitive" },
    });
  });

  it("city → customer.city contains", () => {
    const w = buildOrdersWhere({ customerCodes: null, city: "Луцьк" });
    expect(w.customer).toEqual({
      city: { contains: "Луцьк", mode: "insensitive" },
    });
  });

  it("agent → agentName contains", () => {
    const w = buildOrdersWhere({ customerCodes: null, agent: "Петренко" });
    expect(w.agentName).toEqual({ contains: "Петренко", mode: "insensitive" });
  });

  it("combines clientName + city + scope on customer", () => {
    const w = buildOrdersWhere({
      customerCodes: ["000001"],
      clientName: "Іван",
      city: "Луцьк",
    });
    expect(w.customer).toEqual({
      code1C: { in: ["000001"] },
      name: { contains: "Іван", mode: "insensitive" },
      city: { contains: "Луцьк", mode: "insensitive" },
    });
  });

  it("ignores blank per-column filters", () => {
    const w = buildOrdersWhere({
      customerCodes: null,
      clientName: "  ",
      city: "",
      agent: "   ",
    });
    expect(w.customer).toBeUndefined();
    expect(w.agentName).toBeUndefined();
  });
});

describe("buildOrdersWhere — search (client + products)", () => {
  it("no OR when q empty / blank", () => {
    expect(buildOrdersWhere({ customerCodes: null }).OR).toBeUndefined();
    expect(
      buildOrdersWhere({ customerCodes: null, q: "   " }).OR,
    ).toBeUndefined();
  });

  it("builds OR over code1C, number1C, customer (name/phone/city) and product (name/articleCode)", () => {
    const w = buildOrdersWhere({ customerCodes: null, q: "Іванов" });
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toHaveLength(7);

    const json = JSON.stringify(w.OR);
    // № замовлення (hex + людський номер 1С)
    expect(json).toContain('"code1C"');
    expect(json).toContain('"number1C"');
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
      buildOrdersWhere({ customerCodes: null, status: "not_posted" }).status,
    ).toBe("not_posted");
  });

  it("hides posted by default (main list = not archived)", () => {
    expect(
      buildOrdersWhere({ customerCodes: null, status: "" }).status,
    ).toEqual({ not: "posted" });
  });

  it("shows all statuses when showArchived=true and no status filter", () => {
    expect(
      buildOrdersWhere({
        customerCodes: null,
        status: "",
        showArchived: true,
      }).status,
    ).toBeUndefined();
  });

  it("explicit posted filter is honoured (archive view)", () => {
    expect(
      buildOrdersWhere({ customerCodes: null, status: "posted" }).status,
    ).toBe("posted");
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
    number1C: "L0000000123",
    status: "posted",
    totalEur: 100,
    totalUah: 4300,
    archived: true,
    isActual: false,
    source: "manager",
    agentName: "Петренко П.",
    assignedAgentUserId: null,
    createdAt: new Date("2026-05-10T10:00:00Z"),
    customer: {
      id: "cust1",
      name: "Test Customer",
      code1C: "000001",
      city: "Луцьк",
      phone: "+380501112233",
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

  it("maps agentName", () => {
    expect(serializeOrderRow(raw).agentName).toBe("Петренко П.");
    expect(serializeOrderRow({ ...raw, agentName: null }).agentName).toBeNull();
  });
});
