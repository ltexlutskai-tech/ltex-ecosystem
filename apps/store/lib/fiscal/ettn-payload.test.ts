import { describe, it, expect } from "vitest";
import { buildEttnRequest } from "./ettn-payload";

describe("buildEttnRequest", () => {
  it("single category → one line, price = COD in kopecks, payment = COD", () => {
    const req = buildEttnRequest({
      goods: [{ name: "Одяг вживаний", code: "1", share: 500 }],
      codUah: 1234.5,
      ettn: "20450000000001",
      taxCode: 8,
    });
    expect(req.receipt_body.goods).toHaveLength(1);
    expect(req.receipt_body.goods[0]!.good).toMatchObject({
      code: "1",
      name: "Одяг вживаний",
      price: 123450,
      tax: [8],
    });
    expect(req.receipt_body.goods[0]!.quantity).toBe(1000);
    expect(req.receipt_body.payments[0]).toMatchObject({
      type: "ETTN",
      label: "Платіж через інтегратора NovaPay",
      value: 123450,
      ettn: "20450000000001",
    });
  });

  it("distributes COD across categories; sum of lines == COD kopecks", () => {
    const req = buildEttnRequest({
      goods: [
        { name: "Одяг вживаний", code: "1", share: 300 },
        { name: "Взуття вживане", code: "2", share: 100 },
      ],
      codUah: 1000.01, // 100001 коп → 3/4 та 1/4 з залишком
      ettn: "20450000000002",
      taxCode: 8,
    });
    const codKop = 100001;
    const sum = req.receipt_body.goods.reduce((s, g) => s + g.good.price, 0);
    expect(sum).toBe(codKop);
    expect(req.receipt_body.payments[0]!.value).toBe(codKop);
    // Немає балансуючих знижок, бо суми зійшлись.
    expect(req.receipt_body.discounts).toHaveLength(0);
  });

  it("omits tax when taxCode is null", () => {
    const req = buildEttnRequest({
      goods: [{ name: "Товари для дому вживані", code: "3", share: 1 }],
      codUah: 10,
      ettn: "1",
      taxCode: null,
    });
    expect(req.receipt_body.goods[0]!.good.tax).toEqual([]);
  });

  it("skips zero-share categories", () => {
    const req = buildEttnRequest({
      goods: [
        { name: "Одяг вживаний", code: "1", share: 0 },
        { name: "Взуття вживане", code: "2", share: 50 },
      ],
      codUah: 200,
      ettn: "1",
      taxCode: 8,
    });
    expect(req.receipt_body.goods).toHaveLength(1);
    expect(req.receipt_body.goods[0]!.good.code).toBe("2");
    expect(req.receipt_body.goods[0]!.good.price).toBe(20000);
  });

  it("uses the default footer", () => {
    const req = buildEttnRequest({
      goods: [{ name: "Одяг вживаний", code: "1", share: 1 }],
      codUah: 10,
      ettn: "1",
    });
    expect(req.receipt_body.footer).toBe("Дякуємо за покупку!");
    expect(req.employee).toBe("");
    expect(req.cashRegister).toBe("");
  });
});
