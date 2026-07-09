import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentForm, type PaymentFormProps } from "./payment-form";

// next/navigation — useRouter (push/refresh) заглушка.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// @ltex/ui — Button/Input реальні-достатні; useToast заглушуємо.
vi.mock("@ltex/ui", async () => {
  const React = await import("react");
  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", props, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    useToast: () => ({ toast: vi.fn() }),
  };
});

// ShareSheet — повноцінний Dialog з @ltex/ui; у тесті рендеримо тільки текст,
// щоб не тягнути Radix. Перевіряємо що форма передає згенерований текст-квитанцію.
vi.mock("../../../prices/_components/share-sheet", async () => {
  const React = await import("react");
  return {
    ShareSheet: ({ open, text }: { open: boolean; text: string }) =>
      open
        ? React.createElement("div", { "data-testid": "share-sheet" }, text)
        : null,
  };
});

afterEach(() => cleanup());

const BASE: PaymentFormProps = {
  mode: "sale",
  saleId: "sale-1",
  presetSumToPayEur: 100,
  presetRateEur: 43,
  presetRateUsd: 40,
  clientLabel: "ТОВ Тест",
  clientDebtEur: 0,
  bankAccounts: [
    { id: "b1", name: "ФОП IBAN", hiddenInApp: false },
    { id: "b2", name: "Прихований", hiddenInApp: true },
  ],
  cashFlowArticles: [
    {
      id: "a1",
      code: "01",
      name: "Оплата покупця",
      parentId: null,
      direction: "income",
    },
  ],
  userRole: "admin",
  returnHref: "/manager/sales/sale-1",
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

/**
 * Знаходить input у `<label>`, текст-лейбл якого починається з `prefix`
 * (стійко до hint-тексту праворуч). `Field` рендерить span з лейблом + input.
 */
function inputByLabelPrefix(prefix: string): HTMLInputElement {
  const labels = Array.from(document.querySelectorAll("label"));
  const label = labels.find((l) =>
    l.querySelector("span > span")?.textContent?.startsWith(prefix),
  );
  const input = label?.querySelector("input");
  if (!input) throw new Error(`Не знайдено input для «${prefix}»`);
  return input as HTMLInputElement;
}

describe("PaymentForm", () => {
  it("рендерить режим Приход з підсумками EUR", () => {
    render(<PaymentForm {...BASE} />);
    expect(screen.getByText("Прихід")).toBeDefined();
    expect(screen.getByText("Розхід")).toBeDefined();
    expect(screen.getByText("Оплата (EUR)")).toBeDefined();
    // «До оплати» preset = 100, оплати немає → залишок (борг) = 100 €.
    expect(screen.getByText("Залишок (борг)")).toBeDefined();
  });

  it("стаття руху коштів показується завжди; Розхід ховає решту", () => {
    render(<PaymentForm {...BASE} />);
    // Стаття обов'язкова і для Приходу, і для Розходу — секція є завжди.
    expect(screen.getByText("Стаття руху коштів")).toBeDefined();
    expect(screen.getByText("Решта (здача)")).toBeDefined();

    fireEvent.click(screen.getByText("Розхід"));

    expect(screen.getByText("Стаття руху коштів")).toBeDefined();
    expect(screen.queryByText("Решта (здача)")).toBeNull();
  });

  it("введення готівки оновлює зведення оплати у EUR", () => {
    render(<PaymentForm {...BASE} />);
    // 43 грн / курс 43 = 1.00 € → Оплата (EUR) = 1.00 €.
    fireEvent.change(inputByLabelPrefix("Готівка, грн"), {
      target: { value: "43" },
    });
    expect(screen.getByText("1.00 €")).toBeDefined();
  });

  it("банк. рахунок зʼявляється лише при безналі (>0)", () => {
    render(<PaymentForm {...BASE} />);
    expect(screen.queryByText("Банк. рахунок")).toBeNull();
    fireEvent.change(inputByLabelPrefix("Безготівка, грн"), {
      target: { value: "100" },
    });
    expect(screen.getByText("Банк. рахунок")).toBeDefined();
  });

  it("кнопка «Дати знижку на залишок» зʼявляється лише при дрібному залишку", () => {
    // Залишок 100 € (> поріг 5 €) → кнопки немає.
    render(<PaymentForm {...BASE} />);
    expect(screen.queryByText("Дати знижку на залишок")).toBeNull();
    cleanup();

    // «До оплати» = 3 € і оплати немає → залишок 3 € (≤ 5) → кнопка є.
    render(<PaymentForm {...BASE} presetSumToPayEur={3} />);
    expect(screen.getByText("Дати знижку на залишок")).toBeDefined();
  });

  it("кнопка «Вайбер» відкриває ShareSheet з текстом-квитанцією", () => {
    render(<PaymentForm {...BASE} />);
    expect(screen.queryByTestId("share-sheet")).toBeNull();

    // Внесемо готівку 4300 грн (= 100 €) → оплачено повністю.
    fireEvent.change(inputByLabelPrefix("Готівка, грн"), {
      target: { value: "4300" },
    });
    fireEvent.click(screen.getByText("Вайбер"));

    const sheet = screen.getByTestId("share-sheet");
    expect(sheet.textContent).toContain("Оплата");
    expect(sheet.textContent).toContain("ТОВ Тест");
    expect(sheet.textContent).toContain("Оплачено: 100.00 €");
  });
});
