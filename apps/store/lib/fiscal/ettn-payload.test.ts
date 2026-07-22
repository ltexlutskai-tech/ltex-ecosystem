import { describe, it, expect } from "vitest";
import { buildEttnRequest } from "./ettn-payload";

describe("buildEttnRequest (вага → ціна/кг, сума = накладка)", () => {
  it("одна група: ціна/кг = COD/вага, кількість = вага×1000, сума = COD", () => {
    const req = buildEttnRequest({
      goods: [{ name: "Одяг вживаний", code: "1", weightKg: 10 }],
      codUah: 1234.5, // 123450 коп
      ettn: "204500",
      taxCode: 8,
    });
    const g = req.receipt_body.goods[0]!;
    expect(g.good.price).toBe(12345); // 123450 / 10 кг
    expect(g.quantity).toBe(10000); // 10 кг × 1000
    expect(g.good.tax).toEqual([8]);
    expect(req.receipt_body.payments[0]!.value).toBe(123450);
    expect(req.receipt_body.payments[0]!.ettn).toBe("204500");
    expect(req.receipt_body.discounts).toEqual([]);
  });

  it("кілька груп: ваги додаються, сума рядків = сумі накладки", () => {
    const req = buildEttnRequest({
      goods: [
        { name: "Одяг вживаний", code: "1", weightKg: 30 },
        { name: "Взуття вживане", code: "2", weightKg: 10 },
      ],
      codUah: 1000, // 100000 коп, вага 40 → 2500 коп/кг
      ettn: "204500",
      taxCode: 8,
    });
    const sum = req.receipt_body.goods.reduce(
      (s, g) => s + Math.round((g.quantity * g.good.price) / 1000),
      0,
    );
    expect(sum).toBe(100000);
    expect(req.receipt_body.goods[0]!.quantity).toBe(30000);
    expect(req.receipt_body.goods[1]!.quantity).toBe(10000);
  });

  it("залишок округлення вирівнюється націнкою/знижкою", () => {
    const req = buildEttnRequest({
      goods: [
        { name: "Одяг вживаний", code: "1", weightKg: 30 },
        { name: "Взуття вживане", code: "2", weightKg: 10 },
      ],
      codUah: 1000.01, // 100001 коп → різниця округлення
      ettn: "204500",
      taxCode: 8,
    });
    const goodsSum = req.receipt_body.goods.reduce(
      (s, g) => s + Math.round((g.quantity * g.good.price) / 1000),
      0,
    );
    const d = req.receipt_body.discounts;
    const adj = d.length
      ? d[0]!.type === "DISCOUNT"
        ? -d[0]!.value
        : d[0]!.value
      : 0;
    expect(goodsSum + adj).toBe(100001);
    expect(req.receipt_body.payments[0]!.value).toBe(100001);
  });

  it("група з нульовою вагою пропускається", () => {
    const req = buildEttnRequest({
      goods: [
        { name: "Одяг вживаний", code: "1", weightKg: 0 },
        { name: "Взуття вживане", code: "2", weightKg: 5 },
      ],
      codUah: 200,
      ettn: "204500",
      taxCode: 8,
    });
    expect(req.receipt_body.goods).toHaveLength(1);
    expect(req.receipt_body.goods[0]!.good.code).toBe("2");
  });

  it("немає ваги зовсім → фолбек: один рядок на всю суму", () => {
    const req = buildEttnRequest({
      goods: [{ name: "Одяг вживаний", code: "1", weightKg: 0 }],
      codUah: 300,
      ettn: "204500",
      taxCode: 8,
    });
    expect(req.receipt_body.goods).toHaveLength(1);
    expect(req.receipt_body.goods[0]!.quantity).toBe(1000);
    expect(req.receipt_body.goods[0]!.good.price).toBe(30000);
  });

  it("omits tax when taxCode is null", () => {
    const req = buildEttnRequest({
      goods: [{ name: "Товари для дому вживані", code: "3", weightKg: 2 }],
      codUah: 10,
      ettn: "204500",
      taxCode: null,
    });
    expect(req.receipt_body.goods[0]!.good.tax).toEqual([]);
  });

  it("uses the default footer", () => {
    const req = buildEttnRequest({
      goods: [{ name: "Одяг вживаний", code: "1", weightKg: 1 }],
      codUah: 10,
      ettn: "204500",
    });
    expect(req.receipt_body.footer).toBe("Дякуємо за покупку!");
  });
});
