import { describe, it, expect } from "vitest";
import {
  buildPaymentReceiptText,
  type PaymentReceiptInput,
} from "./payment-message";

function baseInput(
  overrides: Partial<PaymentReceiptInput> = {},
): PaymentReceiptInput {
  return {
    clientName: "ФОП Іваненко",
    paid: { uah: 0, eur: 0, usd: 0, uahCashless: 0 },
    change: { uah: 0, eur: 0, usd: 0 },
    bankAccountName: null,
    rates: { eur: 43, usd: 40 },
    sumToPayEur: 100,
    cashOnDelivery: false,
    codAmountUah: null,
    ...overrides,
  };
}

describe("buildPaymentReceiptText", () => {
  it("показує шапку «Оплата» + ім'я клієнта", () => {
    const text = buildPaymentReceiptText(baseInput());
    const lines = text.split("\n");
    expect(lines[0]).toBe("Оплата");
    expect(lines[1]).toBe("ФОП Іваненко");
  });

  it("зводить готівку UAH у EUR для рядка «Оплачено»", () => {
    // 4300 грн / курс 43 = 100.00 € → оплачено повністю.
    const text = buildPaymentReceiptText(
      baseInput({ paid: { uah: 4300, eur: 0, usd: 0, uahCashless: 0 } }),
    );
    expect(text).toContain("Оплачено: 100.00 €");
  });

  it("виводить лише ненульові канали у «Фактична оплата»", () => {
    const text = buildPaymentReceiptText(
      baseInput({ paid: { uah: 100, eur: 5, usd: 0, uahCashless: 0 } }),
    );
    expect(text).toContain("Фактична оплата:");
    expect(text).toContain("Готівка грн: 100.00 грн");
    expect(text).toContain("EUR: 5.00 €");
    // USD = 0 і безнал = 0 → відсутні рядки.
    expect(text).not.toContain("USD:");
    expect(text).not.toContain("Безнал грн:");
  });

  it("додає назву банк. рахунку у рядок безналу", () => {
    const text = buildPaymentReceiptText(
      baseInput({
        paid: { uah: 0, eur: 0, usd: 0, uahCashless: 200 },
        bankAccountName: "ФОП IBAN UA12",
      }),
    );
    expect(text).toContain("Безнал грн: 200.00 грн (ФОП IBAN UA12)");
  });

  it("виводить блок «Решта» лише коли є здача", () => {
    const noChange = buildPaymentReceiptText(baseInput());
    expect(noChange).not.toContain("Решта:");

    const withChange = buildPaymentReceiptText(
      baseInput({ change: { uah: 50, eur: 0, usd: 0 } }),
    );
    expect(withChange).toContain("Решта:");
    expect(withChange).toContain("50.00 грн");
  });

  it("показує борг коли оплачено менше суми до сплати", () => {
    // Оплачено 43 грн = 1 €; до сплати 100 € → борг 99 €.
    const text = buildPaymentReceiptText(
      baseInput({ paid: { uah: 43, eur: 0, usd: 0, uahCashless: 0 } }),
    );
    expect(text).toContain("Борг: 99.00 €");
    expect(text).not.toContain("Переплата:");
  });

  it("показує переплату коли оплачено більше суми до сплати", () => {
    // Оплачено 120 € при сумі до сплати 100 € → переплата 20 €.
    const text = buildPaymentReceiptText(
      baseInput({ paid: { uah: 0, eur: 120, usd: 0, uahCashless: 0 } }),
    );
    expect(text).toContain("Переплата: 20.00 €");
    expect(text).not.toContain("Борг:");
  });

  it("показує рядок наложки коли cashOnDelivery", () => {
    const text = buildPaymentReceiptText(
      baseInput({ cashOnDelivery: true, codAmountUah: 4300 }),
    );
    expect(text).toContain("Накладений платіж: 4300.00 грн");
  });

  // ── Задача F: Розхід (РКО) ──
  it("Розхід → шапка «Видача коштів» + «Видано» + «Фактична видача»", () => {
    const text = buildPaymentReceiptText(
      baseInput({
        type: "expense",
        paid: { uah: 4300, eur: 0, usd: 0, uahCashless: 0 },
      }),
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe("Видача коштів");
    expect(text).toContain("Видано: 100.00 €");
    expect(text).toContain("Фактична видача:");
    // Борг/Переплата не показуємо для розходу.
    expect(text).not.toContain("Борг:");
    expect(text).not.toContain("Переплата:");
  });

  it("Приход (дефолт без type) поводиться як раніше", () => {
    const text = buildPaymentReceiptText(baseInput());
    expect(text.split("\n")[0]).toBe("Оплата");
  });

  // ── Задача E: призначення платежу у рядку безналу ──
  it("додає призначення платежу у рядок безналу", () => {
    const text = buildPaymentReceiptText(
      baseInput({
        paid: { uah: 0, eur: 0, usd: 0, uahCashless: 200 },
        bankAccountName: "ПриватБанк",
        paymentPurpose: "Оплата за товар №5",
      }),
    );
    expect(text).toContain(
      "Безнал грн: 200.00 грн (ПриватБанк) — Оплата за товар №5",
    );
  });
});
