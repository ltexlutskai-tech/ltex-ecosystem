import { describe, it, expect } from "vitest";
import {
  unitLabel,
  rowStatus,
  summarizeInventory,
  warehouseLotToRow,
  findRowIndexByBarcode,
  type InvRow,
  type WarehouseLot,
} from "./inventory";

function row(p: Partial<InvRow>): InvRow {
  return {
    key: p.key ?? "k",
    lotId: p.lotId ?? null,
    productId: p.productId ?? null,
    productName: p.productName ?? "",
    articleCode: p.articleCode ?? "",
    barcode: p.barcode ?? "",
    sector: p.sector ?? "",
    quality: p.quality ?? "",
    weight: p.weight ?? 0,
    unitName: p.unitName ?? "шт",
    priceEur: p.priceEur ?? 0,
    qtyAccounting: p.qtyAccounting ?? 0,
    qtyActual: p.qtyActual ?? 0,
  };
}

describe("unitLabel", () => {
  it("мапить одиниці виміру", () => {
    expect(unitLabel("kg")).toBe("кг");
    expect(unitLabel("piece")).toBe("шт");
    expect(unitLabel("pair")).toBe("пар");
    expect(unitLabel("liter")).toBe("л");
  });
  it("fallback для невідомих/порожніх", () => {
    expect(unitLabel(null)).toBe("шт");
    expect(unitLabel(undefined)).toBe("шт");
    expect(unitLabel("box")).toBe("box");
  });
});

describe("rowStatus", () => {
  it("збіг = облік і факт", () => {
    expect(rowStatus({ qtyAccounting: 1, qtyActual: 1 })).toBe("matched");
  });
  it("нестача = облік без факту", () => {
    expect(rowStatus({ qtyAccounting: 1, qtyActual: 0 })).toBe("missing");
  });
  it("надлишок = факт без обліку", () => {
    expect(rowStatus({ qtyAccounting: 0, qtyActual: 1 })).toBe("surplus");
  });
  it("порожній = ані обліку, ані факту", () => {
    expect(rowStatus({ qtyAccounting: 0, qtyActual: 0 })).toBe("empty");
  });
});

describe("summarizeInventory", () => {
  it("рахує збіги/нестачі/надлишки + ваги + суму", () => {
    const rows = [
      row({ qtyAccounting: 1, qtyActual: 1, weight: 10, priceEur: 5 }), // збіг
      row({ qtyAccounting: 1, qtyActual: 0, weight: 8, priceEur: 4 }), // нестача
      row({ qtyAccounting: 0, qtyActual: 1, weight: 3, priceEur: 2 }), // надлишок
      row({ qtyAccounting: 0, qtyActual: 0 }), // порожній → ігнор
    ];
    const s = summarizeInventory(rows);
    expect(s.rows).toBe(3);
    expect(s.found).toBe(2); // збіг + надлишок
    expect(s.matched).toBe(1);
    expect(s.missing).toBe(1);
    expect(s.surplus).toBe(1);
    expect(s.accWeight).toBe(18); // 10 + 8
    expect(s.actWeight).toBe(13); // 10 + 3
    expect(s.missingWeight).toBe(8);
    expect(s.surplusWeight).toBe(3);
    expect(s.actAmountEur).toBe(7); // 5*1 (збіг) + 2*1 (надлишок)
  });

  it("сума факт = Σ ціна×факт", () => {
    const s = summarizeInventory([
      row({ qtyAccounting: 1, qtyActual: 1, priceEur: 5 }),
      row({ qtyAccounting: 0, qtyActual: 1, priceEur: 2 }),
    ]);
    expect(s.actAmountEur).toBe(7);
  });

  it("порожній список → нулі", () => {
    const s = summarizeInventory([]);
    expect(s.rows).toBe(0);
    expect(s.found).toBe(0);
    expect(s.missing).toBe(0);
    expect(s.surplus).toBe(0);
  });
});

describe("warehouseLotToRow", () => {
  it("мапить мішок у рядок Облік=1, Факт=0", () => {
    const lot: WarehouseLot = {
      lotId: "L1",
      barcode: "200099",
      productId: "P1",
      productName: "Кросівки",
      articleCode: "HOKA",
      weight: 18.5,
      quantity: 1,
      priceEur: 42,
      sector: "Струмівка",
      unitName: "шт",
      quality: "Новий",
    };
    const r = warehouseLotToRow(lot, "k1");
    expect(r.key).toBe("k1");
    expect(r.qtyAccounting).toBe(1);
    expect(r.qtyActual).toBe(0);
    expect(r.lotId).toBe("L1");
    expect(r.sector).toBe("Струмівка");
    expect(r.weight).toBe(18.5);
  });

  it("null-поля мішка → порожні рядки", () => {
    const lot: WarehouseLot = {
      lotId: "L2",
      barcode: "111",
      productId: null,
      productName: "",
      articleCode: null,
      weight: 0,
      quantity: 1,
      priceEur: 0,
      sector: null,
      unitName: "шт",
      quality: null,
    };
    const r = warehouseLotToRow(lot, "k2");
    expect(r.articleCode).toBe("");
    expect(r.sector).toBe("");
    expect(r.quality).toBe("");
  });
});

describe("findRowIndexByBarcode", () => {
  const rows = [
    row({ key: "a", barcode: "111" }),
    row({ key: "b", barcode: "222" }),
    row({ key: "c", barcode: "" }),
  ];
  it("знаходить за точним ШК (з обрізанням пробілів)", () => {
    expect(findRowIndexByBarcode(rows, "222")).toBe(1);
    expect(findRowIndexByBarcode(rows, " 111 ")).toBe(0);
  });
  it("−1 якщо нема / порожній запит", () => {
    expect(findRowIndexByBarcode(rows, "999")).toBe(-1);
    expect(findRowIndexByBarcode(rows, "")).toBe(-1);
    expect(findRowIndexByBarcode(rows, "   ")).toBe(-1);
  });
});
