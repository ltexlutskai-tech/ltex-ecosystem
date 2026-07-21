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

describe("bulk-edit registry — allow-list", () => {
  it("resolves known entity/field", () => {
    expect(getBulkEntity("product")?.entity).toBe("product");
    expect(getBulkField("product", "packaging")?.column).toBe("packaging");
    expect(getBulkField("product", "categoryId")?.column).toBe("categoryId");
  });

  it("returns null for unknown entity or field", () => {
    expect(getBulkEntity("orders")).toBeNull();
    expect(getBulkField("product", "priceEur")).toBeNull();
    expect(getBulkField("unknown", "packaging")).toBeNull();
  });
});

function field(key: string) {
  const f = getBulkField("product", key);
  if (!f) throw new Error(`missing field ${key}`);
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

  it("returns [] for unknown entity", () => {
    expect(serializeFields("orders", ADMIN)).toHaveLength(0);
  });
});
