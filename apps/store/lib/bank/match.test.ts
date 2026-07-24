import { describe, it, expect } from "vitest";
import {
  collectSignals,
  decide,
  extractDocRefs,
  normalizePayerName,
  type MatchTxnInput,
} from "./match";

const TXN: MatchTxnInput = {
  amount: 18437.5,
  currencyCode: "UAH",
  occurredAt: new Date("2026-07-24T10:00:00Z"),
  counterIban: "UA893220010000026001234567890",
  counterEdrpou: "3096889974",
  counterName: "ФОП Мельник Олена Іванівна",
  comment: "Оплата за товар, Мельник О.І., L0002477123",
  description: null,
};

const FUTURE = new Date("2026-08-10T00:00:00Z");

describe("extractDocRefs", () => {
  it("знаходить номери документів формату L+цифри", () => {
    expect(extractDocRefs(["Оплата за замовлення L0000002477"])).toEqual([
      "L0000002477",
    ]);
  });

  it("дедуплікує і працює з кількома текстами", () => {
    expect(
      extractDocRefs(["за L0000002477", "L0000002477 та l0000009999"]),
    ).toEqual(["L0000002477", "L0000009999"]);
  });

  it("ігнорує короткі/відсутні", () => {
    expect(extractDocRefs(["L123", null, undefined, "без номера"])).toEqual([]);
  });
});

describe("normalizePayerName", () => {
  it("прибирає ФОП/ТОВ/лапки/регістр", () => {
    expect(normalizePayerName('ТОВ "Вертикаль"')).toBe("вертикаль");
    expect(normalizePayerName("ФОП Мельник Олена")).toBe("мельник олена");
  });
});

describe("collectSignals + decide", () => {
  it("2 сильні сигнали одного клієнта → auto", () => {
    const signals = collectSignals(TXN, {
      docRefs: [{ ref: "L0002477123", customerId: "cust-1", saleId: "sale-1" }],
      expectations: [
        {
          id: "exp-1",
          customerId: "cust-1",
          saleId: "sale-1",
          amountUah: 18437.5,
          expiresAt: FUTURE,
        },
      ],
      payerRequisites: [],
    });
    const d = decide(signals);
    expect(d.action).toBe("auto");
    expect(d.customerId).toBe("cust-1");
    expect(d.saleId).toBe("sale-1");
    expect(d.expectationId).toBe("exp-1");
  });

  it("1 сильний сигнал → draft", () => {
    const signals = collectSignals(TXN, {
      docRefs: [],
      expectations: [
        {
          id: "exp-1",
          customerId: "cust-1",
          saleId: null,
          amountUah: 18437.5,
          expiresAt: FUTURE,
        },
      ],
      payerRequisites: [],
    });
    const d = decide(signals);
    expect(d.action).toBe("draft");
    expect(d.customerId).toBe("cust-1");
  });

  it("памʼять платників (IBAN) — сильний сигнал; разом з очікуванням → auto", () => {
    const signals = collectSignals(TXN, {
      docRefs: [],
      expectations: [
        {
          id: "exp-1",
          customerId: "cust-1",
          saleId: null,
          amountUah: 18437.5,
          expiresAt: FUTURE,
        },
      ],
      payerRequisites: [
        {
          customerId: "cust-1",
          counterIban: TXN.counterIban,
          counterEdrpou: null,
        },
      ],
    });
    expect(decide(signals).action).toBe("auto");
  });

  it("очікування з іншою сумою не спрацьовує", () => {
    const signals = collectSignals(TXN, {
      docRefs: [],
      expectations: [
        {
          id: "exp-1",
          customerId: "cust-1",
          saleId: null,
          amountUah: 18000,
          expiresAt: FUTURE,
        },
      ],
      payerRequisites: [],
    });
    expect(decide(signals).action).toBe("none");
  });

  it("протерміноване очікування не спрацьовує", () => {
    const signals = collectSignals(TXN, {
      docRefs: [],
      expectations: [
        {
          id: "exp-1",
          customerId: "cust-1",
          saleId: null,
          amountUah: 18437.5,
          expiresAt: new Date("2026-07-01T00:00:00Z"),
        },
      ],
      payerRequisites: [],
    });
    expect(decide(signals).action).toBe("none");
  });

  it("конфлікт клієнтів між сильними сигналами → none", () => {
    const signals = collectSignals(TXN, {
      docRefs: [{ ref: "L0002477123", customerId: "cust-A", saleId: null }],
      expectations: [
        {
          id: "exp-1",
          customerId: "cust-B",
          saleId: null,
          amountUah: 18437.5,
          expiresAt: FUTURE,
        },
      ],
      payerRequisites: [],
    });
    const d = decide(signals);
    expect(d.action).toBe("none");
    expect(d.note).toContain("Конфлікт");
  });

  it("лише схожа назва (слабкий) → none з підказкою", () => {
    const signals = collectSignals(TXN, {
      docRefs: [],
      expectations: [],
      payerRequisites: [],
      namesByCustomer: new Map([["cust-1", "мельник олена іванівна"]]),
    });
    const d = decide(signals);
    expect(d.action).toBe("none");
    expect(d.note).toContain("Підказка");
  });

  it("два однакові kind одного клієнта → draft (не auto)", () => {
    const signals = collectSignals(TXN, {
      docRefs: [],
      expectations: [
        {
          id: "exp-1",
          customerId: "cust-1",
          saleId: null,
          amountUah: 18437.5,
          expiresAt: FUTURE,
        },
        {
          id: "exp-2",
          customerId: "cust-1",
          saleId: null,
          amountUah: 18437.5,
          expiresAt: FUTURE,
        },
      ],
      payerRequisites: [],
    });
    expect(decide(signals).action).toBe("draft");
  });
});
