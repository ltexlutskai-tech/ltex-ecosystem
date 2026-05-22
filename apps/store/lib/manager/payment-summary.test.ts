import { describe, it, expect } from "vitest";
import {
  aggregatePaymentSummary,
  type PaymentOrderInput,
} from "./payment-summary";

const RATES = { eur: 43, usd: 40 };

function income(over: Partial<PaymentOrderInput> = {}): PaymentOrderInput {
  return {
    type: "income",
    amountUah: 0,
    amountEur: 0,
    amountUsd: 0,
    amountUahCashless: 0,
    ...over,
  };
}
function expense(over: Partial<PaymentOrderInput> = {}): PaymentOrderInput {
  return {
    type: "expense",
    amountUah: 0,
    amountEur: 0,
    amountUsd: 0,
    amountUahCashless: 0,
    ...over,
  };
}

describe("aggregatePaymentSummary", () => {
  it("no orders → full debt, status=debt, cod = due", () => {
    const s = aggregatePaymentSummary({
      dueUah: 4300,
      orders: [],
      rates: RATES,
    });
    expect(s.receivedUah).toBe(0);
    expect(s.balanceUah).toBe(4300);
    expect(s.status).toBe("debt");
    expect(s.codAmountUah).toBe(4300);
  });

  it("exact UAH payment → settled, cod=0", () => {
    const s = aggregatePaymentSummary({
      dueUah: 4300,
      orders: [income({ amountUah: 4300 })],
      rates: RATES,
    });
    expect(s.receivedUah).toBe(4300);
    expect(s.balanceUah).toBe(0);
    expect(s.status).toBe("settled");
    expect(s.codAmountUah).toBe(0);
    expect(s.byCurrency.incomeUah).toBe(4300);
  });

  it("EUR + USD converted via snapshot rates", () => {
    // 50 EUR * 43 = 2150 ; 10 USD * 40 = 400 → 2550 received
    const s = aggregatePaymentSummary({
      dueUah: 2550,
      orders: [income({ amountEur: 50, amountUsd: 10 })],
      rates: RATES,
    });
    expect(s.receivedUah).toBe(2550);
    expect(s.status).toBe("settled");
    expect(s.byCurrency.incomeEur).toBe(50);
    expect(s.byCurrency.incomeUsd).toBe(10);
  });

  it("overpay with change order → prepay before change, expense reduces received", () => {
    // income 5000 UAH, change (expense) 700 UAH → received = 4300
    const s = aggregatePaymentSummary({
      dueUah: 4300,
      orders: [income({ amountUah: 5000 }), expense({ amountUah: 700 })],
      rates: RATES,
    });
    expect(s.receivedUah).toBe(4300);
    expect(s.changeUah).toBe(700);
    expect(s.balanceUah).toBe(0);
    expect(s.status).toBe("settled");
    expect(s.byCurrency.changeUah).toBe(700);
  });

  it("net overpay → status=prepay, cod=0", () => {
    const s = aggregatePaymentSummary({
      dueUah: 4300,
      orders: [income({ amountUah: 5000 })],
      rates: RATES,
    });
    expect(s.balanceUah).toBeLessThan(0);
    expect(s.status).toBe("prepay");
    expect(s.codAmountUah).toBe(0);
  });

  it("partial payment → debt, cod = remaining balance", () => {
    const s = aggregatePaymentSummary({
      dueUah: 4300,
      orders: [income({ amountUah: 1300, amountUahCashless: 1000 })],
      rates: RATES,
    });
    expect(s.receivedUah).toBe(2300);
    expect(s.balanceUah).toBe(2000);
    expect(s.status).toBe("debt");
    expect(s.codAmountUah).toBe(2000);
    expect(s.byCurrency.incomeUahCashless).toBe(1000);
  });
});
