import { describe, it, expect } from "vitest";
import { docRefSchema, parseStoredDocRef } from "./doc-ref";

describe("docRefSchema", () => {
  it("accepts a valid internal doc ref", () => {
    const r = docRefSchema.safeParse({
      type: "order",
      label: "Замовлення №L1",
      url: "/manager/orders/abc",
    });
    expect(r.success).toBe(true);
  });

  it("rejects external urls", () => {
    const r = docRefSchema.safeParse({
      type: "order",
      label: "x",
      url: "https://evil.example/phish",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown types", () => {
    const r = docRefSchema.safeParse({
      type: "invoice",
      label: "x",
      url: "/manager/x",
    });
    expect(r.success).toBe(false);
  });
});

describe("parseStoredDocRef", () => {
  it("returns null for junk", () => {
    expect(parseStoredDocRef(null)).toBeNull();
    expect(parseStoredDocRef("nope")).toBeNull();
    expect(parseStoredDocRef({ type: "order" })).toBeNull();
  });

  it("parses a stored ref", () => {
    const v = parseStoredDocRef({
      type: "sale",
      label: "Реалізація 1",
      subtitle: "Клієнт",
      url: "/manager/sales/1",
    });
    expect(v?.type).toBe("sale");
    expect(v?.subtitle).toBe("Клієнт");
  });
});
