import { describe, it, expect } from "vitest";
import {
  buildSalesWhere,
  normalizeSaleStatus,
  serializeSaleRow,
  type RawSaleRow,
} from "./sales-list";

describe("normalizeSaleStatus", () => {
  it("accepts whitelisted status", () => {
    expect(normalizeSaleStatus("draft")).toBe("draft");
    expect(normalizeSaleStatus("posted")).toBe("posted");
  });

  it("ignores unknown / empty", () => {
    expect(normalizeSaleStatus("haxxor")).toBe("");
    expect(normalizeSaleStatus("")).toBe("");
    expect(normalizeSaleStatus(undefined)).toBe("");
  });

  it("trims whitespace", () => {
    expect(normalizeSaleStatus("  sent  ")).toBe("sent");
  });
});

describe("buildSalesWhere — ownership scope", () => {
  it("admin (null scope) → no customer scope", () => {
    const w = buildSalesWhere({ scope: null });
    expect(w.customer).toBeUndefined();
  });

  it("manager → scopes to own client codes", () => {
    const w = buildSalesWhere({ scope: ["000001", "000002"] });
    expect(w.customer).toEqual({ code1C: { in: ["000001", "000002"] } });
  });

  it("clientCode1C deeplink narrows to single code (manager)", () => {
    const w = buildSalesWhere({
      scope: ["000001", "000002"],
      clientCode1C: "000002",
    });
    expect(w.customer).toEqual({ code1C: "000002" });
  });

  it("clientCode1C deeplink works for admin too", () => {
    const w = buildSalesWhere({ scope: null, clientCode1C: "000009" });
    expect(w.customer).toEqual({ code1C: "000009" });
  });
});

describe("buildSalesWhere — per-column filters", () => {
  it("clientName → customer.name contains", () => {
    const w = buildSalesWhere({ scope: null, clientName: "Іван" });
    expect(w.customer).toEqual({
      name: { contains: "Іван", mode: "insensitive" },
    });
  });

  it("city → customer.city contains", () => {
    const w = buildSalesWhere({ scope: null, city: "Луцьк" });
    expect(w.customer).toEqual({
      city: { contains: "Луцьк", mode: "insensitive" },
    });
  });

  it("agent → agentName contains", () => {
    const w = buildSalesWhere({ scope: null, agent: "Петренко" });
    expect(w.agentName).toEqual({ contains: "Петренко", mode: "insensitive" });
  });

  it("combines clientName + city + scope on customer", () => {
    const w = buildSalesWhere({
      scope: ["000001"],
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
    const w = buildSalesWhere({
      scope: null,
      clientName: "  ",
      city: "",
      agent: "   ",
    });
    expect(w.agentName).toBeUndefined();
    expect(w.customer).toBeUndefined();
  });
});

describe("buildSalesWhere — archived filter", () => {
  it("hides archived by default (archived = false)", () => {
    const w = buildSalesWhere({ scope: null });
    expect(w.archived).toBe(false);
  });

  it("showArchived=true removes archived constraint", () => {
    const w = buildSalesWhere({ scope: null, showArchived: true });
    expect(w.archived).toBeUndefined();
  });
});

describe("buildSalesWhere — search (client + products + docNumber)", () => {
  it("no OR when search empty / blank", () => {
    expect(buildSalesWhere({ scope: null }).OR).toBeUndefined();
    expect(buildSalesWhere({ scope: null, search: "   " }).OR).toBeUndefined();
  });

  it("builds OR over number1C, code1C, customer (name/phone/city) and product (name/articleCode)", () => {
    const w = buildSalesWhere({ scope: null, search: "Іванов" });
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toHaveLength(7);

    const json = JSON.stringify(w.OR);
    expect(json).toContain('"number1C"');
    expect(json).toContain('"code1C"');
    expect(json).toContain('"name"');
    expect(json).toContain('"phone"');
    expect(json).toContain('"city"');
    expect(json).toContain('"items"');
    expect(json).toContain('"articleCode"');
    expect(json).toContain('"Іванов"');
  });

  it("adds docNumber clause when search is numeric (8th OR)", () => {
    const w = buildSalesWhere({ scope: null, search: "42" });
    expect(w.OR).toHaveLength(8);
    expect(JSON.stringify(w.OR)).toContain('"docNumber":42');
  });

  it("strips leading № when matching docNumber", () => {
    const w = buildSalesWhere({ scope: null, search: "№42" });
    expect(JSON.stringify(w.OR)).toContain('"docNumber":42');
  });

  it("matches products via items.some(product.name)", () => {
    const w = buildSalesWhere({ scope: null, search: "куртка" });
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
    const w = buildSalesWhere({ scope: null, search: "  abc  " });
    expect(JSON.stringify(w.OR)).toContain('"abc"');
    expect(JSON.stringify(w.OR)).not.toContain('"  abc  "');
  });
});

describe("buildSalesWhere — status + date range", () => {
  it("applies status when present", () => {
    expect(buildSalesWhere({ scope: null, status: "sent" }).status).toBe(
      "sent",
    );
  });

  it("omits status when empty", () => {
    expect(buildSalesWhere({ scope: null, status: "" }).status).toBeUndefined();
  });

  it("applies date range (gte/lte)", () => {
    const from = new Date("2026-05-01");
    const to = new Date("2026-05-31");
    const w = buildSalesWhere({ scope: null, from, to });
    expect(w.createdAt).toEqual({ gte: from, lte: to });
  });

  it("applies only from", () => {
    const from = new Date("2026-05-01");
    const w = buildSalesWhere({ scope: null, from });
    expect(w.createdAt).toEqual({ gte: from });
  });
});

describe("serializeSaleRow", () => {
  const raw: RawSaleRow = {
    id: "sale1",
    code1C: null,
    number1C: null,
    docNumber: 7,
    status: "posted",
    totalEur: 100,
    totalUah: 4300,
    archived: true,
    isActual: false,
    agentName: "Петренко",
    createdAt: new Date("2026-05-10T10:00:00Z"),
    customer: {
      id: "cust1",
      name: "Test Customer",
      code1C: "000001",
      city: "Луцьк",
    },
    _count: { items: 3 },
  };

  it("maps raw row to flat list item incl. docNumber / city / archived / itemCount", () => {
    const row = serializeSaleRow(raw);
    expect(row.id).toBe("sale1");
    expect(row.docNumber).toBe(7);
    expect(row.customer.city).toBe("Луцьк");
    expect(row.isActual).toBe(false);
    expect(row.archived).toBe(true);
    expect(row.itemCount).toBe(3);
    expect(row.totalUah).toBe(4300);
    expect(row.agentName).toBe("Петренко");
  });

  it("maps null agentName", () => {
    const row = serializeSaleRow({ ...raw, agentName: null });
    expect(row.agentName).toBeNull();
  });

  it("tolerates null city", () => {
    const row = serializeSaleRow({
      ...raw,
      customer: { ...raw.customer, city: null },
    });
    expect(row.customer.city).toBeNull();
  });
});
