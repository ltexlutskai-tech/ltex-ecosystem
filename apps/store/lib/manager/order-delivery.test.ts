import { describe, it, expect } from "vitest";
import { classifyDelivery, findDeliveryCode } from "./order-delivery";

describe("classifyDelivery", () => {
  it("легасі-коди", () => {
    expect(classifyDelivery("delivery")).toBe("delivery");
    expect(classifyDelivery("post")).toBe("post");
    expect(classifyDelivery("pickup")).toBe("pickup");
  });
  it("за лейблом довідника", () => {
    expect(classifyDelivery("d1", "Нова Пошта")).toBe("post");
    expect(classifyDelivery("d2", "Укрпошта")).toBe("ukrposhta");
    expect(classifyDelivery("ukrposhta")).toBe("ukrposhta");
    expect(classifyDelivery("d3", "Доставка")).toBe("delivery");
    expect(classifyDelivery("d4", "Кур'єр")).toBe("delivery");
    expect(classifyDelivery("d5", "Самовивіз")).toBe("pickup");
    expect(classifyDelivery("d6", "Щось інше")).toBe("other");
  });
  it("порожній код → other", () => {
    expect(classifyDelivery(null)).toBe("other");
    expect(classifyDelivery("")).toBe("other");
  });
});

describe("findDeliveryCode", () => {
  it("знаходить код способу «Доставка» зі списку", () => {
    const opts = [
      { code: "np", label: "Нова Пошта" },
      { code: "dlv", label: "Доставка" },
      { code: "pk", label: "Самовивіз" },
    ];
    expect(findDeliveryCode(opts)).toBe("dlv");
  });
  it("null коли доставки немає", () => {
    expect(findDeliveryCode([{ code: "pk", label: "Самовивіз" }])).toBeNull();
  });
});
