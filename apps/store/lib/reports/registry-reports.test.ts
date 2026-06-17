import { describe, it, expect } from "vitest";
import {
  summarizeSales,
  totalSales,
  summarizeCashFlow,
  totalCashFlow,
  summarizeStockBalance,
  totalStock,
  type SalesMovementLite,
  type CashFlowMovementLite,
  type StockMovementLite,
} from "./registry-reports";

function sale(p: Partial<SalesMovementLite>): SalesMovementLite {
  return {
    clientCode1C: "c1",
    clientName: "Клієнт 1",
    productCode1C: "p1",
    productName: "Товар 1",
    agentCode1C: "a1",
    agentName: "Агент 1",
    qty: 1,
    weightKg: 10,
    revenueEur: 100,
    revenueNoDiscountEur: 100,
    recordKind: 0,
    ...p,
  };
}

describe("summarizeSales", () => {
  it("групує по клієнту + сумує виручку/кг", () => {
    const rows = summarizeSales(
      [
        sale({ clientCode1C: "c1", revenueEur: 100, weightKg: 10 }),
        sale({ clientCode1C: "c1", revenueEur: 50, weightKg: 5 }),
        sale({
          clientCode1C: "c2",
          clientName: "Клієнт 2",
          revenueEur: 200,
          weightKg: 20,
        }),
      ],
      "client",
    );
    expect(rows).toHaveLength(2);
    // сортування за виручкою спадно → c2 першим
    expect(rows[0]!.key).toBe("c2");
    expect(rows[0]!.revenueEur).toBe(200);
    expect(rows[1]!.key).toBe("c1");
    expect(rows[1]!.revenueEur).toBe(150);
    expect(rows[1]!.weightKg).toBe(15);
  });

  it("повернення (recordKind 1) зменшує виручку клієнта", () => {
    const rows = summarizeSales(
      [
        sale({ revenueEur: 100, weightKg: 10, recordKind: 0 }),
        sale({ revenueEur: 30, weightKg: 3, recordKind: 1 }),
      ],
      "client",
    );
    expect(rows[0]!.revenueEur).toBe(70);
    expect(rows[0]!.weightKg).toBe(7);
  });

  it("обчислює ефект знижок (СтоимостьБезСкидок − Стоимость)", () => {
    const rows = summarizeSales(
      [sale({ revenueEur: 90, revenueNoDiscountEur: 100 })],
      "client",
    );
    expect(rows[0]!.discountEur).toBe(10);
  });

  it("групування по агенту: null агент → «Без агента»", () => {
    const rows = summarizeSales(
      [sale({ agentCode1C: null, agentName: null, revenueEur: 5 })],
      "agent",
    );
    expect(rows[0]!.label).toBe("Без агента");
  });

  it("totalSales підсумовує всі групи", () => {
    const rows = summarizeSales(
      [
        sale({ clientCode1C: "c1", revenueEur: 100, weightKg: 10 }),
        sale({ clientCode1C: "c2", revenueEur: 200, weightKg: 20 }),
      ],
      "client",
    );
    const t = totalSales(rows);
    expect(t.revenueEur).toBe(300);
    expect(t.weightKg).toBe(30);
  });
});

describe("summarizeCashFlow", () => {
  function cf(p: Partial<CashFlowMovementLite>): CashFlowMovementLite {
    return {
      articleCode1C: "art1",
      articleName: "Стаття 1",
      direction: 0,
      amountUah: 100,
      amountUpr: null,
      ...p,
    };
  }

  it("прихід/розхід/сальдо по статтях", () => {
    const rows = summarizeCashFlow([
      cf({ articleCode1C: "art1", direction: 0, amountUah: 1000 }),
      cf({ articleCode1C: "art1", direction: 1, amountUah: 400 }),
      cf({
        articleCode1C: "art2",
        articleName: "Стаття 2",
        direction: 1,
        amountUah: 250,
      }),
    ]);
    const art1 = rows.find((r) => r.key === "art1")!;
    expect(art1.inflowUah).toBe(1000);
    expect(art1.outflowUah).toBe(400);
    expect(art1.netUah).toBe(600);
    const art2 = rows.find((r) => r.key === "art2")!;
    expect(art2.netUah).toBe(-250);
  });

  it("null стаття → «Без статті»", () => {
    const rows = summarizeCashFlow([
      cf({ articleCode1C: null, articleName: null }),
    ]);
    expect(rows[0]!.label).toBe("Без статті");
  });

  it("totalCashFlow — загальне сальдо", () => {
    const rows = summarizeCashFlow([
      cf({ direction: 0, amountUah: 1000 }),
      cf({ direction: 1, amountUah: 300 }),
    ]);
    const t = totalCashFlow(rows);
    expect(t.inflowUah).toBe(1000);
    expect(t.outflowUah).toBe(300);
    expect(t.netUah).toBe(700);
  });
});

describe("summarizeStockBalance", () => {
  function st(p: Partial<StockMovementLite>): StockMovementLite {
    return {
      productCode1C: "p1",
      productName: "Товар 1",
      quality: "extra",
      qty: 10,
      weightKg: 200,
      recordKind: 0,
      ...p,
    };
  }

  it("залишок = приходи − розходи", () => {
    const rows = summarizeStockBalance(
      [
        st({ productCode1C: "p1", qty: 10, weightKg: 200, recordKind: 0 }),
        st({ productCode1C: "p1", qty: 4, weightKg: 80, recordKind: 1 }),
      ],
      "product",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(6);
    expect(rows[0]!.weightKg).toBe(120);
  });

  it("нульовий залишок відкидається", () => {
    const rows = summarizeStockBalance(
      [
        st({ productCode1C: "p1", qty: 5, weightKg: 100, recordKind: 0 }),
        st({ productCode1C: "p1", qty: 5, weightKg: 100, recordKind: 1 }),
      ],
      "product",
    );
    expect(rows).toHaveLength(0);
  });

  it("групування по якості", () => {
    const rows = summarizeStockBalance(
      [
        st({ quality: "extra", weightKg: 100, qty: 1 }),
        st({ quality: "cream", weightKg: 50, qty: 1 }),
      ],
      "quality",
    );
    expect(rows).toHaveLength(2);
    // сортування за вагою спадно
    expect(rows[0]!.key).toBe("extra");
  });

  it("totalStock — сума шт + кг", () => {
    const rows = summarizeStockBalance(
      [
        st({ productCode1C: "p1", qty: 6, weightKg: 120 }),
        st({ productCode1C: "p2", qty: 2, weightKg: 40 }),
      ],
      "product",
    );
    const t = totalStock(rows);
    expect(t.qty).toBe(8);
    expect(t.weightKg).toBe(160);
  });
});
