import { describe, it, expect } from "vitest";
import {
  currencyFromIsoNum,
  minorToAmount,
  monoAccountTitle,
  normalizeMonoAccount,
  normalizeMonoStatementItem,
} from "./normalize";
import type { MonoAccount, MonoStatementItem } from "./monobank";

describe("currencyFromIsoNum", () => {
  it("мапить основні валюти", () => {
    expect(currencyFromIsoNum(980)).toBe("UAH");
    expect(currencyFromIsoNum(978)).toBe("EUR");
    expect(currencyFromIsoNum(840)).toBe("USD");
  });

  it("невідомий код лишає числом-рядком", () => {
    expect(currencyFromIsoNum(999)).toBe("999");
  });
});

describe("minorToAmount", () => {
  it("конвертує копійки в гривні", () => {
    expect(minorToAmount(1843750)).toBe(18437.5);
    expect(minorToAmount(100)).toBe(1);
  });

  it("зберігає знак розходу", () => {
    expect(minorToAmount(-95000)).toBe(-950);
  });

  it("прибирає float-шум округленням до копійки", () => {
    expect(minorToAmount(0.9999)).toBe(0.01);
  });
});

const ITEM: MonoStatementItem = {
  id: "ZuHWzqkKGVo=",
  time: 1753350000,
  description: "Від ФОП Мельник",
  amount: 1843750,
  currencyCode: 980,
  balance: 21438000,
  comment: "Оплата за товар, Мельник О.І., L0002477",
  counterEdrpou: "3096889974",
  counterIban: "UA893220010000026001234567890",
  counterName: "ФОП Мельник Олена Іванівна",
  hold: false,
};

describe("normalizeMonoStatementItem", () => {
  it("зводить StatementItem до форми BankTransaction", () => {
    const n = normalizeMonoStatementItem("acc-1", ITEM);
    expect(n.provider).toBe("monobank");
    expect(n.externalId).toBe("ZuHWzqkKGVo=");
    expect(n.accountExternalId).toBe("acc-1");
    expect(n.occurredAt.getTime()).toBe(1753350000 * 1000);
    expect(n.amount).toBe(18437.5);
    expect(n.currencyCode).toBe("UAH");
    expect(n.counterEdrpou).toBe("3096889974");
    expect(n.counterName).toBe("ФОП Мельник Олена Іванівна");
    expect(n.comment).toBe("Оплата за товар, Мельник О.І., L0002477");
    expect(n.balanceAfter).toBe(214380);
    expect(n.hold).toBe(false);
    expect(n.raw).toBe(ITEM);
  });

  it("порожні/відсутні поля → null; hold=true зберігається", () => {
    const n = normalizeMonoStatementItem("acc-1", {
      id: "x",
      time: 1753350000,
      amount: -12000,
      currencyCode: 978,
      hold: true,
      counterName: "  ",
    });
    expect(n.amount).toBe(-120);
    expect(n.currencyCode).toBe("EUR");
    expect(n.counterName).toBeNull();
    expect(n.counterIban).toBeNull();
    expect(n.comment).toBeNull();
    expect(n.balanceAfter).toBeNull();
    expect(n.hold).toBe(true);
  });
});

describe("monoAccountTitle / normalizeMonoAccount", () => {
  const ACC: MonoAccount = {
    id: "acc-1",
    balance: 21438000,
    creditLimit: 0,
    type: "fop",
    currencyCode: 980,
    maskedPan: ["537541******1234"],
    iban: "UA733220010000026201234567890",
  };

  it("назва з типу + маски картки", () => {
    expect(monoAccountTitle(ACC)).toBe("ФОП ****1234");
  });

  it("без маски — хвіст IBAN", () => {
    expect(monoAccountTitle({ ...ACC, maskedPan: undefined })).toBe(
      "ФОП …567890",
    );
  });

  it("normalizeMonoAccount: валюта/залишок/кредитний ліміт", () => {
    const n = normalizeMonoAccount(ACC);
    expect(n.provider).toBe("monobank");
    expect(n.externalId).toBe("acc-1");
    expect(n.currencyCode).toBe("UAH");
    expect(n.balance).toBe(214380);
    expect(n.creditLimit).toBeNull(); // 0 → немає ліміту
    expect(n.iban).toBe("UA733220010000026201234567890");
  });

  it("ненульовий кредитний ліміт конвертується", () => {
    const n = normalizeMonoAccount({ ...ACC, creditLimit: 10000000 });
    expect(n.creditLimit).toBe(100000);
  });
});

// ─── PrivatBank (Автоклієнт) ─────────────────────────────────────────────────

import {
  normalizePrivatBalance,
  normalizePrivatTransaction,
  parsePrivatDateTime,
  parsePrivatNumber,
  privatExternalId,
} from "./normalize";
import type { PrivatTransaction } from "./privatbank";

describe("parsePrivatNumber / parsePrivatDateTime", () => {
  it("парсить суми з комою/пробілами", () => {
    expect(parsePrivatNumber("1234.56")).toBe(1234.56);
    expect(parsePrivatNumber("1 234,56")).toBe(1234.56);
    expect(parsePrivatNumber("")).toBeNull();
    expect(parsePrivatNumber(undefined)).toBeNull();
    expect(parsePrivatNumber("abc")).toBeNull();
  });

  it("парсить DD-MM-YYYY HH:MM:SS", () => {
    const d = parsePrivatDateTime("24-07-2026 10:15:30");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(24);
    expect(d?.getHours()).toBe(10);
  });

  it("fallback на DAT_OD + TIM_P і null на сміття", () => {
    const d = parsePrivatDateTime(undefined, "01-02-2026", "09:30");
    expect(d?.getDate()).toBe(1);
    expect(d?.getMonth()).toBe(1);
    expect(parsePrivatDateTime("2026-07-24")).toBeNull();
  });
});

const PRIVAT_TXN: PrivatTransaction = {
  AUT_MY_ACC: "UA603052990000026003010807538",
  AUT_CNTR_ACC: "UA893220010000026001234567890",
  AUT_CNTR_NAM: "ФОП Мельник Олена Іванівна",
  AUT_CNTR_CRF: "3096889974",
  CCY: "UAH",
  SUM: "18437.50",
  SUM_E: "18437.50",
  TRANTYPE: "C",
  OSND: "Оплата за товар, Мельник О.І., L0000002477",
  NUM_DOC: "125",
  DAT_OD: "24-07-2026",
  TIM_P: "10:15",
  DATE_TIME_DAT_OD_TIM_P: "24-07-2026 10:15:30",
  TECHNICAL_TRANSACTION_ID: "4140766673_online",
  PR_PR: "r",
};

describe("normalizePrivatTransaction", () => {
  it("прихід (TRANTYPE=C) → додатна сума + контрагент + призначення", () => {
    const n = normalizePrivatTransaction(PRIVAT_TXN);
    expect(n).not.toBeNull();
    expect(n?.provider).toBe("privatbank");
    expect(n?.externalId).toBe("4140766673_online");
    expect(n?.accountExternalId).toBe("UA603052990000026003010807538");
    expect(n?.amount).toBe(18437.5);
    expect(n?.currencyCode).toBe("UAH");
    expect(n?.counterEdrpou).toBe("3096889974");
    expect(n?.comment).toContain("L0000002477");
    expect(n?.hold).toBe(false);
  });

  it("розхід (TRANTYPE=D) → відʼємна сума", () => {
    const n = normalizePrivatTransaction({ ...PRIVAT_TXN, TRANTYPE: "D" });
    expect(n?.amount).toBe(-18437.5);
  });

  it("провізорний рядок (PR_PR≠r) → hold", () => {
    const n = normalizePrivatTransaction({ ...PRIVAT_TXN, PR_PR: "p" });
    expect(n?.hold).toBe(true);
  });

  it("рядок без id/рахунку/суми/дати → null", () => {
    expect(
      normalizePrivatTransaction({ ...PRIVAT_TXN, AUT_MY_ACC: undefined }),
    ).toBeNull();
    expect(
      normalizePrivatTransaction({ ...PRIVAT_TXN, SUM: undefined }),
    ).toBeNull();
    expect(
      normalizePrivatTransaction({
        ...PRIVAT_TXN,
        TECHNICAL_TRANSACTION_ID: undefined,
        ID: undefined,
        REF: undefined,
      }),
    ).toBeNull();
  });

  it("privatExternalId: fallback REF|REFN|дата|сума", () => {
    expect(
      privatExternalId({
        ...PRIVAT_TXN,
        TECHNICAL_TRANSACTION_ID: undefined,
        ID: undefined,
        REF: "REF1",
        REFN: "2",
      }),
    ).toBe("REF1|2|24-07-2026|18437.50");
  });
});

describe("normalizePrivatBalance", () => {
  it("мапить залишок у форму рахунку фіда", () => {
    const n = normalizePrivatBalance({
      acc: "UA603052990000026003010807538",
      nameACC: "Основний",
      currency: "UAH",
      balanceOut: "109536.71",
    });
    expect(n?.provider).toBe("privatbank");
    expect(n?.externalId).toBe("UA603052990000026003010807538");
    expect(n?.balance).toBe(109536.71);
    expect(n?.title).toBe("Основний");
  });

  it("без IBAN → null", () => {
    expect(normalizePrivatBalance({ currency: "UAH" })).toBeNull();
  });
});
