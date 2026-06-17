import { describe, it, expect } from "vitest";
import { tabLabelForPath } from "./tab-label";

describe("tabLabelForPath", () => {
  it("matches an exact block path", () => {
    expect(tabLabelForPath("/manager/orders")).toBe("Замовлення");
    expect(tabLabelForPath("/manager/sales")).toBe("Реалізація");
    expect(tabLabelForPath("/manager/payments")).toBe("Оплати");
  });

  it("maps a detail page back to its block", () => {
    expect(tabLabelForPath("/manager/orders/123")).toBe("Замовлення");
    expect(tabLabelForPath("/manager/sales/abc/print")).toBe("Реалізація");
  });

  it("returns dashboard label for /manager", () => {
    expect(tabLabelForPath("/manager")).toBe("Робочий стіл");
    expect(tabLabelForPath("/manager/")).toBe("Робочий стіл");
  });

  it("prefers the more specific (longer) prefix", () => {
    // /manager/admin/users must not be swallowed by /manager
    expect(tabLabelForPath("/manager/admin/users")).toBe("Користувачі");
    expect(tabLabelForPath("/manager/admin/users/42")).toBe("Користувачі");
  });

  it("ignores query string and hash", () => {
    expect(tabLabelForPath("/manager/orders?status=draft#top")).toBe(
      "Замовлення",
    );
  });

  it("falls back to last segment for unknown paths", () => {
    expect(tabLabelForPath("/manager/unknown-block")).toBe("unknown-block");
  });

  it("falls back to «Сторінка» when no useful segment", () => {
    expect(tabLabelForPath("/manager/")).toBe("Робочий стіл");
    expect(tabLabelForPath("/")).toBe("Сторінка");
  });
});
