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
