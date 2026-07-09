import { describe, it, expect, vi } from "vitest";

// Мок @ltex/db: prisma (глобальний, не використовується — передаємо db явно),
// Prisma.Decimal (для запису costPerKgEur). Клас — усередині фабрики (hoisted).
vi.mock("@ltex/db", () => ({
  prisma: {},
  Prisma: {
    Decimal: class {
      constructor(public value: number) {}
    },
  },
}));

import {
  buildRepackApply,
  applyRepackFullCycle,
  removeRepackFullCycle,
  type RepackApplyInput,
} from "./repack-full-cycle";

const occurredAt = new Date("2026-07-13T00:00:00Z");

function input(over: Partial<RepackApplyInput> = {}): RepackApplyInput {
  return {
    recorder: "RPK1",
    occurredAt,
    toleranceKg: 2,
    sources: [{ weight: 20, purchasePriceEur: 2 }],
    assembled: [
      {
        itemId: "a1",
        productId: "PA",
        productCode1C: "CODE-PA",
        weight: 12,
        quantity: 1,
        salePriceEur: 5,
      },
      {
        itemId: "a2",
        productId: "PB",
        productCode1C: "CODE-PB",
        weight: 8,
        quantity: 1,
        salePriceEur: 6,
      },
    ],
    ...over,
  };
}

describe("buildRepackApply — пул собівартості", () => {
  it("рознесення собівартості пропорційно вазі (costPerKg = totalCost/outW)", () => {
    const plan = buildRepackApply(input());
    // totalCost = 2 * 20 = 40; outW = 20 → costPerKg = 2
    expect(plan.totalSourceCostEur).toBe(40);
    expect(plan.costPerKgEur).toBe(2);
    expect(plan.newLots).toHaveLength(2);
    // costEur = costPerKg × вага рядка
    expect(plan.newLots[0]?.costEur).toBe(24); // 2 * 12
    expect(plan.newLots[1]?.costEur).toBe(16); // 2 * 8
    // Σ costEur = собівартість джерела
    expect(plan.costRows.reduce((s, r) => s + Number(r.costEur), 0)).toBe(40);
  });

  it("кілька джерел з різною собівартістю усереднюються за вагою", () => {
    const plan = buildRepackApply(
      input({
        sources: [
          { weight: 10, purchasePriceEur: 1 }, // 10
          { weight: 10, purchasePriceEur: 3 }, // 30
        ],
        assembled: [
          {
            itemId: "a1",
            productId: "PA",
            productCode1C: null,
            weight: 20,
            quantity: 1,
            salePriceEur: 5,
          },
        ],
      }),
    );
    expect(plan.totalSourceCostEur).toBe(40); // 10 + 30
    expect(plan.costPerKgEur).toBe(2); // 40 / 20
  });

  it("costPerKg = 0 коли вихідна вага нульова", () => {
    const plan = buildRepackApply(input({ assembled: [] }));
    expect(plan.outputWeight).toBe(0);
    expect(plan.costPerKgEur).toBe(0);
    expect(plan.newLots).toHaveLength(0);
  });

  it("cost-рядки нумеруються (lineNo 1..N) з реєстратором", () => {
    const plan = buildRepackApply(input());
    expect(plan.costRows[0]).toMatchObject({
      recorderCode1C: "RPK1",
      lineNo: 1,
      productCode1C: "CODE-PA",
      productId: "PA",
    });
    expect(plan.costRows[1]?.lineNo).toBe(2);
  });
});

describe("buildRepackApply — контроль ваги (допуск)", () => {
  it("рівно допуск (2 кг) — НЕ попередження (строго >)", () => {
    const plan = buildRepackApply(
      input({
        sources: [{ weight: 22, purchasePriceEur: 2 }],
        // outW = 20 → різниця рівно 2
      }),
    );
    expect(plan.inputWeight).toBe(22);
    expect(plan.outputWeight).toBe(20);
    expect(plan.lossWeight).toBe(2);
    expect(plan.weightWarning).toBe(false);
  });

  it("більше допуску (3 кг) — попередження", () => {
    const plan = buildRepackApply(
      input({ sources: [{ weight: 23, purchasePriceEur: 2 }] }),
    );
    expect(plan.lossWeight).toBe(3);
    expect(plan.weightWarning).toBe(true);
  });

  it("від'ємна різниця (зібрали більше) також ловиться за модулем", () => {
    const plan = buildRepackApply(
      input({ sources: [{ weight: 16, purchasePriceEur: 2 }] }),
    );
    expect(plan.lossWeight).toBe(-4);
    expect(plan.weightWarning).toBe(true);
  });

  it("допуск читається з налаштування (tolerance=5 → 3 кг ок)", () => {
    const plan = buildRepackApply(
      input({ toleranceKg: 5, sources: [{ weight: 23, purchasePriceEur: 2 }] }),
    );
    expect(plan.weightWarning).toBe(false);
  });
});

// ─── apply / remove з мок-БД ────────────────────────────────────────────────

interface Captured {
  lotUpdate: unknown[];
  lotCreate: unknown[];
  lotDeleteMany: unknown[];
  itemUpdate: unknown[];
  itemUpdateMany: unknown[];
  costDeleteMany: unknown[];
  costCreateMany: unknown[];
  repackUpdate: unknown[];
}

function makeDb(
  doc: unknown,
  lots: unknown[],
  products: unknown[] = [],
): { db: unknown; cap: Captured } {
  const cap: Captured = {
    lotUpdate: [],
    lotCreate: [],
    lotDeleteMany: [],
    itemUpdate: [],
    itemUpdateMany: [],
    costDeleteMany: [],
    costCreateMany: [],
    repackUpdate: [],
  };
  let lotSeq = 0;
  const tx = {
    lot: {
      update: vi.fn(async (a: unknown) => {
        cap.lotUpdate.push(a);
      }),
      create: vi.fn(async (a: unknown) => {
        cap.lotCreate.push(a);
        lotSeq += 1;
        return { id: `newlot-${lotSeq}` };
      }),
      deleteMany: vi.fn(async (a: unknown) => {
        cap.lotDeleteMany.push(a);
      }),
    },
    repackingItem: {
      update: vi.fn(async (a: unknown) => {
        cap.itemUpdate.push(a);
      }),
      updateMany: vi.fn(async (a: unknown) => {
        cap.itemUpdateMany.push(a);
      }),
    },
    costMovement: {
      deleteMany: vi.fn(async (a: unknown) => {
        cap.costDeleteMany.push(a);
      }),
      createMany: vi.fn(async (a: unknown) => {
        cap.costCreateMany.push(a);
      }),
    },
    repacking: {
      update: vi.fn(async (a: unknown) => {
        cap.repackUpdate.push(a);
      }),
    },
    warehouseSector: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => ({ name: "X" })),
      create: vi.fn(async () => ({ id: "sec-new" })),
    },
  };
  const db = {
    repacking: { findUnique: vi.fn(async () => doc) },
    lot: { findMany: vi.fn(async () => lots) },
    product: { findMany: vi.fn(async () => products) },
    $transaction: vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx)),
  };
  return { db, cap };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("applyRepackFullCycle — проведення", () => {
  it("списує джерело, створює нові лоти, пише собівартість + шапку", async () => {
    const doc = {
      id: "RPK1",
      code1C: null,
      docDate: occurredAt,
      items: [
        {
          id: "d1",
          role: "disassembled",
          productId: "PS",
          barcode: "SRC1",
          sourceLotId: null,
          weight: 20,
          quantity: 1,
          salePriceEur: null,
          priceEur: 0,
          qualityId: null,
          sector: null,
          sectorId: null,
        },
        {
          id: "a1",
          role: "assembled",
          productId: "PA",
          barcode: "NEW1",
          sourceLotId: null,
          weight: 12,
          quantity: 1,
          salePriceEur: 5,
          priceEur: 5,
          qualityId: "Q1",
          sector: null,
          sectorId: null,
        },
        {
          id: "a2",
          role: "assembled",
          productId: "PB",
          barcode: "NEW2",
          sourceLotId: null,
          weight: 8,
          quantity: 1,
          salePriceEur: 6,
          priceEur: 6,
          qualityId: null,
          sector: null,
          sectorId: null,
        },
      ],
    };
    const lots = [
      {
        id: "lot1",
        barcode: "SRC1",
        status: "free",
        weight: 20,
        purchasePriceEur: 2,
      },
    ];
    const { db, cap } = makeDb(doc, lots);

    const res = await applyRepackFullCycle(
      "RPK1",
      2,
      db as Parameters<typeof applyRepackFullCycle>[2],
    );

    expect(res.weightWarning).toBe(false);
    expect(res.costPerKgEur).toBe(2);
    expect(res.lotsCreated).toBe(2);

    // Джерело списано (status repacked_out, quantity 0, бронь знята).
    expect(cap.lotUpdate).toHaveLength(1);
    expect(cap.lotUpdate[0]).toMatchObject({
      where: { id: "lot1" },
      data: {
        status: "repacked_out",
        quantity: 0,
        reservedForClientId: null,
      },
    });

    // Два нові лоти з правильною ціною/собівартістю/датою.
    expect(cap.lotCreate).toHaveLength(2);
    const create0 = cap.lotCreate[0] as { data: Record<string, unknown> };
    expect(create0.data).toMatchObject({
      productId: "PA",
      barcode: "NEW1",
      weight: 12,
      quantity: 1,
      status: "free",
      priceEur: 5,
      purchasePriceEur: 2,
      arrivalDate: occurredAt,
    });

    // Собівартість: delete-then-create, 2 рядки.
    expect(cap.costDeleteMany[0]).toMatchObject({
      where: { recorderCode1C: "RPK1" },
    });
    const costData = (
      cap.costCreateMany[0] as { data: Array<{ costEur: number }> }
    ).data;
    expect(costData).toHaveLength(2);
    expect(costData.reduce((s, r) => s + Number(r.costEur), 0)).toBe(40);

    // Шапка: ваги.
    expect(cap.repackUpdate[0]).toMatchObject({
      data: { inputWeight: 20, outputWeight: 20, lossWeight: 0 },
    });
  });

  it("прапорець weightWarning при перевищенні допуску", async () => {
    const doc = {
      id: "RPK2",
      code1C: "HEX2",
      docDate: occurredAt,
      items: [
        {
          id: "d1",
          role: "disassembled",
          productId: "PS",
          barcode: "SRC1",
          sourceLotId: null,
          weight: 25,
          quantity: 1,
          salePriceEur: null,
          priceEur: 0,
          qualityId: null,
          sector: null,
          sectorId: null,
        },
        {
          id: "a1",
          role: "assembled",
          productId: "PA",
          barcode: "NEW1",
          sourceLotId: null,
          weight: 20,
          quantity: 1,
          salePriceEur: 5,
          priceEur: 5,
          qualityId: null,
          sector: null,
          sectorId: null,
        },
      ],
    };
    const lots = [
      {
        id: "lot1",
        barcode: "SRC1",
        status: "free",
        weight: 25,
        purchasePriceEur: 2,
      },
    ];
    const { db } = makeDb(doc, lots);
    const res = await applyRepackFullCycle(
      "RPK2",
      2,
      db as Parameters<typeof applyRepackFullCycle>[2],
    );
    // Реєстратор = code1C для історичних (HEX2).
    expect(res.weightWarning).toBe(true); // 25 − 20 = 5 > 2
  });

  it("кидає, якщо рядок комплектації без товару", async () => {
    const doc = {
      id: "RPK3",
      code1C: null,
      docDate: occurredAt,
      items: [
        {
          id: "a1",
          role: "assembled",
          productId: null,
          barcode: "NEW1",
          sourceLotId: null,
          weight: 10,
          quantity: 1,
          salePriceEur: 5,
          priceEur: 5,
          qualityId: null,
          sector: null,
          sectorId: null,
        },
      ],
    };
    const { db } = makeDb(doc, []);
    await expect(
      applyRepackFullCycle(
        "RPK3",
        2,
        db as Parameters<typeof applyRepackFullCycle>[2],
      ),
    ).rejects.toThrow(/assembled_item_without_product/);
  });
});

describe("removeRepackFullCycle — реверс", () => {
  it("видаляє створені лоти, відновлює джерело, прибирає собівартість", async () => {
    const doc = {
      id: "RPK1",
      code1C: null,
      items: [
        {
          id: "d1",
          role: "disassembled",
          createdLotId: null,
          sourceLotId: "lot1",
          sourcePrevStatus: "free",
        },
        {
          id: "a1",
          role: "assembled",
          createdLotId: "newlot-1",
          sourceLotId: null,
          sourcePrevStatus: null,
        },
      ],
    };
    const { db, cap } = makeDb(doc, []);
    removeRepackFullCycle(
      "RPK1",
      db as Parameters<typeof removeRepackFullCycle>[1],
    );
    await flush();

    // Джерело відновлено.
    expect(cap.lotUpdate[0]).toMatchObject({
      where: { id: "lot1" },
      data: { status: "free", quantity: 1 },
    });
    // Створений лот видалено.
    expect(cap.lotDeleteMany[0]).toMatchObject({
      where: { id: { in: ["newlot-1"] } },
    });
    // Собівартість прибрано за реєстратором.
    expect(cap.costDeleteMany[0]).toMatchObject({
      where: { recorderCode1C: "RPK1" },
    });
    expect(cap.itemUpdateMany).toHaveLength(1);
  });
});
