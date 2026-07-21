import { describe, it, expect } from "vitest";
import {
  assertValueForField,
  BulkFieldError,
  getBulkEntity,
  getBulkField,
  serializeFields,
} from "./registry";
import type { ManagerRole } from "@/lib/auth/jwt";

const ADMIN: ManagerRole = "admin";
const MANAGER: ManagerRole = "manager";

const OWNER: ManagerRole = "owner";

describe("bulk-edit registry — allow-list", () => {
  it("resolves known entity/field", () => {
    expect(getBulkEntity("product")?.entity).toBe("product");
    expect(getBulkField("product", "packaging")?.column).toBe("packaging");
    expect(getBulkField("product", "categoryId")?.column).toBe("categoryId");
  });

  it("resolves client entity + select fields with refModel", () => {
    expect(getBulkEntity("client")?.entity).toBe("client");
    const agent = getBulkField("client", "agentUserId");
    expect(agent?.column).toBe("agentUserId");
    expect(agent?.type).toBe("select");
    expect(agent?.refModel).toBe("user");
    expect(getBulkField("client", "statusGeneralId")?.refModel).toBe(
      "mgrClientStatus",
    );
    expect(getBulkField("client", "primaryRouteId")?.refModel).toBe("mgrRoute");
  });

  it("resolves order + sale document entities with boolean flags", () => {
    expect(getBulkEntity("order")?.entity).toBe("order");
    expect(getBulkEntity("sale")?.entity).toBe("sale");
    expect(getBulkField("order", "isActual")?.type).toBe("boolean");
    expect(getBulkField("order", "archived")?.column).toBe("archived");
    expect(getBulkField("sale", "isActual")?.column).toBe("isActual");
    expect(getBulkField("sale", "archived")?.type).toBe("boolean");
  });

  it("returns null for unknown entity or field", () => {
    expect(getBulkEntity("unknownEntity")).toBeNull();
    expect(getBulkField("product", "priceEur")).toBeNull();
    expect(getBulkField("unknown", "packaging")).toBeNull();
    expect(getBulkField("order", "status")).toBeNull();
  });
});

function field(key: string) {
  const f = getBulkField("product", key);
  if (!f) throw new Error(`missing field ${key}`);
  return f;
}

function clientField(key: string) {
  const f = getBulkField("client", key);
  if (!f) throw new Error(`missing client field ${key}`);
  return f;
}

function docField(entity: "order" | "sale", key: string) {
  const f = getBulkField(entity, key);
  if (!f) throw new Error(`missing ${entity} field ${key}`);
  return f;
}

describe("bulk-edit registry — value validation", () => {
  it("enum accepts allowed option, rejects others", () => {
    expect(assertValueForField(field("packaging"), "box")).toBe("box");
    expect(assertValueForField(field("packaging"), "bag")).toBe("bag");
    expect(() => assertValueForField(field("packaging"), "sack")).toThrow(
      BulkFieldError,
    );
  });

  it("nullable field allows null (clear); non-nullable rejects null", () => {
    // packaging is nullable
    expect(assertValueForField(field("packaging"), null)).toBeNull();
    // categoryId is NOT nullable
    expect(() => assertValueForField(field("categoryId"), null)).toThrow(
      BulkFieldError,
    );
    // inStock is NOT nullable
    expect(() => assertValueForField(field("inStock"), null)).toThrow(
      BulkFieldError,
    );
  });

  it("boolean requires a real boolean", () => {
    expect(assertValueForField(field("inStock"), true)).toBe(true);
    expect(assertValueForField(field("archived"), false)).toBe(false);
    expect(() => assertValueForField(field("inStock"), "true")).toThrow(
      BulkFieldError,
    );
    expect(() => assertValueForField(field("inStock"), 1)).toThrow(
      BulkFieldError,
    );
  });

  it("category requires a non-empty string", () => {
    expect(assertValueForField(field("categoryId"), "cat_1")).toBe("cat_1");
    expect(() => assertValueForField(field("categoryId"), "")).toThrow(
      BulkFieldError,
    );
    expect(() => assertValueForField(field("categoryId"), 42)).toThrow(
      BulkFieldError,
    );
  });

  it("select requires a non-empty string (like category)", () => {
    const agent = clientField("agentUserId");
    expect(assertValueForField(agent, "user_1")).toBe("user_1");
    expect(() => assertValueForField(agent, "")).toThrow(BulkFieldError);
    expect(() => assertValueForField(agent, 7)).toThrow(BulkFieldError);
    // nullable select allows clearing.
    expect(assertValueForField(agent, null)).toBeNull();
  });

  it("document booleans require a real boolean", () => {
    const isActual = docField("order", "isActual");
    expect(assertValueForField(isActual, true)).toBe(true);
    expect(assertValueForField(docField("sale", "archived"), false)).toBe(
      false,
    );
    expect(() => assertValueForField(isActual, "true")).toThrow(BulkFieldError);
    // isActual is NOT nullable.
    expect(() => assertValueForField(isActual, null)).toThrow(BulkFieldError);
  });

  it("text enforces max length and type", () => {
    expect(assertValueForField(field("producer"), "VIVE")).toBe("VIVE");
    expect(() =>
      assertValueForField(field("producer"), "x".repeat(101)),
    ).toThrow(BulkFieldError);
    expect(() => assertValueForField(field("producer"), 5)).toThrow(
      BulkFieldError,
    );
  });
});

describe("bulk-edit registry — serializeFields", () => {
  it("hides column and includes only fields allowed for role", () => {
    const forAdmin = serializeFields("product", ADMIN);
    expect(forAdmin.length).toBeGreaterThan(0);
    // No `column` leaks to client.
    for (const f of forAdmin) {
      expect(f).not.toHaveProperty("column");
    }
    // Regular manager cannot manage catalog → no fields.
    expect(serializeFields("product", MANAGER)).toHaveLength(0);
  });

  it("injects dynamic options for category type", () => {
    const fields = serializeFields("product", ADMIN, {
      categoryId: [{ value: "c1", label: "Одяг" }],
    });
    const cat = fields.find((f) => f.key === "categoryId");
    expect(cat?.options).toEqual([{ value: "c1", label: "Одяг" }]);
  });

  it("injects dynamic options for select fields (client)", () => {
    const fields = serializeFields("client", OWNER, {
      agentUserId: [{ value: "u1", label: "Іван" }],
    });
    const agent = fields.find((f) => f.key === "agentUserId");
    expect(agent?.type).toBe("select");
    expect(agent?.options).toEqual([{ value: "u1", label: "Іван" }]);
    // Field without provided options defaults to empty array.
    const status = fields.find((f) => f.key === "statusGeneralId");
    expect(status?.options).toEqual([]);
  });

  it("gates client/order/sale entities to admin/owner only", () => {
    // manager sees nothing for the new entities.
    expect(serializeFields("client", MANAGER)).toHaveLength(0);
    expect(serializeFields("order", MANAGER)).toHaveLength(0);
    expect(serializeFields("sale", MANAGER)).toHaveLength(0);
    // admin/owner see the fields.
    expect(serializeFields("client", ADMIN).length).toBeGreaterThan(0);
    expect(serializeFields("client", OWNER).length).toBeGreaterThan(0);
    expect(serializeFields("order", ADMIN)).toHaveLength(2);
    expect(serializeFields("sale", OWNER)).toHaveLength(2);
  });

  it("returns [] for unknown entity", () => {
    expect(serializeFields("unknownEntity", ADMIN)).toHaveLength(0);
  });
});
