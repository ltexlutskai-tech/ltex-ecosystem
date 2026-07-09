import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RouteSheetForm, type RouteSheetView } from "./route-sheet-form";

// next/navigation — useRouter заглушка (push/refresh).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// @ltex/ui — мінімальні Button/Textarea.
vi.mock("@ltex/ui", async () => {
  const React = await import("react");
  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", props, children),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
  };
});

// Важкі діти — заглушки.
vi.mock("./order-picker-modal", () => ({ OrderPickerModal: () => null }));
vi.mock("../../_components/route-sheet-status-badge", () => ({
  RouteSheetStatusBadge: () => null,
}));

afterEach(() => cleanup());

function makeView(over: Partial<RouteSheetView> = {}): RouteSheetView {
  return {
    id: "rs1",
    displayNumber: "1",
    date: "2026-05-20T00:00:00.000Z",
    arrivalDate: null,
    status: "draft",
    routeId: null,
    expeditorUserId: null,
    comment: null,
    totalEur: 0,
    totalUah: 0,
    mileageStartKm: null,
    mileageEndKm: null,
    pricePerKm: null,
    gpsLat: null,
    gpsLng: null,
    mileageWarning: null,
    orders: [],
    items: [],
    loading: [],
    shortage: [],
    counters: { ordersCount: 0, orderedQty: 0, loadedQty: 0, shortageQty: 0 },
    sales: [],
    saleItems: [],
    payments: [],
    expenses: [],
    tasks: [],
    ...over,
  };
}

function openTab(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}

describe("RouteSheetForm — Stage 3 tabs", () => {
  it("Реалізації: рядок реалізації + лінк «Відкрити» на sale", () => {
    render(
      <RouteSheetForm
        initial={makeView({
          orders: [
            {
              id: "rso1",
              orderId: "o1",
              orderNumber: "ORD-1",
              customerId: "c1",
              customerName: "Клієнт А",
              city: "Луцьк",
            },
          ],
          sales: [
            {
              id: "s1",
              docNumber: 3,
              code1C: null,
              status: "draft",
              customerId: "c1",
              customerName: "Клієнт А",
              orderId: "o1",
              totalEur: 100,
              totalUah: 4300,
            },
          ],
        })}
        routes={[]}
        expeditors={[]}
      />,
    );
    openTab("Реалізації");

    // Кнопка «Реалізація» по замовленню → preset routeSheetId + clientId + orderId.
    const saleBtn = screen.getByRole("link", { name: "Реалізація" });
    expect(saleBtn.getAttribute("href")).toContain("routeSheetId=rs1");
    expect(saleBtn.getAttribute("href")).toContain("clientId=c1");
    expect(saleBtn.getAttribute("href")).toContain("orderId=o1");

    // «Непланова реалізація» — без clientId/orderId.
    const unplanned = screen.getByRole("link", {
      name: "Непланова реалізація",
    });
    expect(unplanned.getAttribute("href")).toContain("routeSheetId=rs1");

    // Анти-дубль note + «Відкрити» на деталь sale.
    expect(screen.getByText("вже є реалізація")).toBeDefined();
    const open = screen.getByRole("link", { name: "Відкрити" });
    expect(open.getAttribute("href")).toBe("/manager/sales/s1");
  });

  it("Продажи: рядок деталізації товару", () => {
    render(
      <RouteSheetForm
        initial={makeView({
          saleItems: [
            {
              id: "si1",
              saleId: "s1",
              saleNumber: 3,
              customerName: "Клієнт А",
              productId: "p1",
              productName: "Куртки",
              articleCode: "ART-1",
              lotId: "l1",
              barcode: "BC-1",
              quantity: 1,
              weight: 20,
              pricePerKg: 5,
              priceEur: 100,
            },
          ],
        })}
        routes={[]}
        expeditors={[]}
      />,
    );
    openTab("Продажи");
    expect(screen.getByText("Куртки")).toBeDefined();
    expect(screen.getByText("ART-1")).toBeDefined();
  });

  it("Оплати: рядок оплати + кнопка «Створити оплату» з preset", () => {
    render(
      <RouteSheetForm
        initial={makeView({
          payments: [
            {
              id: "co1",
              docNumber: 7,
              type: "income",
              customerId: "c1",
              customerName: "Клієнт А",
              saleId: "s1",
              documentSumEur: 100,
            },
          ],
        })}
        routes={[]}
        expeditors={[]}
      />,
    );
    openTab("Оплати");
    const create = screen.getByRole("link", { name: /Створити оплату/ });
    expect(create.getAttribute("href")).toContain("routeSheetId=rs1");
    expect(screen.getByText("Прихід")).toBeDefined();
  });
});

describe("RouteSheetForm — round-2 corrections", () => {
  it("Маршрут — вільнотекстове поле з comment (без MgrRoute select)", () => {
    render(
      <RouteSheetForm
        initial={makeView({ comment: "11-12.02.26 Житомир-Вінниця" })}
        expeditors={[]}
      />,
    );
    // Поле «Маршрут» — текстовий input із значенням comment.
    const routeInput = screen.getByDisplayValue("11-12.02.26 Житомир-Вінниця");
    expect((routeInput as HTMLInputElement).type).toBe("text");
    // Окремого «Коментар» поля немає.
    expect(screen.queryByText("Коментар")).toBeNull();
  });

  it("Загрузка — read-only (без кнопок скану / видалення / редагування)", () => {
    render(
      <RouteSheetForm
        initial={makeView({
          loading: [
            {
              id: "ld1",
              orderId: "o1",
              orderNumber: "ORD-1",
              customerId: "c1",
              customerName: "Клієнт А",
              productId: "p1",
              productName: "Куртки",
              articleCode: "ART-1",
              lotId: "l1",
              barcode: "BC-LOADING-1",
              unit: "кг",
              quantity: 1,
              weight: 20,
              price: 5,
              sum: 100,
              pricePerKg: 5,
              loaded: true,
              isReturn: false,
            },
          ],
        })}
        expeditors={[]}
      />,
    );
    openTab("Загрузка");

    // Примітка про 1С-обмін.
    expect(
      screen.getByText(/Завантаження надходить з 1С при обміні/),
    ).toBeDefined();
    // Рядок видно (ШК).
    expect(screen.getByText("BC-LOADING-1")).toBeDefined();
    // Жодних редагувань: чекбоксів немає (read-only бейджі замість них).
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    // «Завантажено» рендериться як read-only бейдж «Так».
    expect(screen.getByText("Так")).toBeDefined();
    // Кнопки прибрати рядок немає.
    expect(screen.queryByLabelText("Прибрати рядок завантаження")).toBeNull();
  });
});
