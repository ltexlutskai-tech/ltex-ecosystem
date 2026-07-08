import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ClosuresTable, itemKey, type ClosureOrder } from "./closures-table";

afterEach(() => cleanup());

function makeOrder(overrides: Partial<ClosureOrder> = {}): ClosureOrder {
  return {
    orderUid: "ord-1",
    orderNumber: "L0000000001",
    orderDate: "2026-05-01T00:00:00Z",
    status: "posted",
    isActual: true,
    closable: true,
    totalEur: 100,
    items: [
      {
        productUid: "p-1",
        productName: "Mix A",
        articleCode: "37047",
        quantity: 100,
        weight: 200,
        unitPriceEur: 0.5,
        sum: 100,
        sold: 25,
        fullySold: false,
      },
    ],
    ...overrides,
  };
}

const noop = () => {};

describe("ClosuresTable", () => {
  it("рендерить замовлення з позиціями", () => {
    render(
      <ClosuresTable
        orders={[makeOrder()]}
        selected={new Set()}
        onToggleItem={noop}
        onToggleOrder={noop}
        onCloseOrder={noop}
        closingOrderId={null}
      />,
    );
    expect(screen.getByText("Mix A")).toBeDefined();
    expect(screen.getByText("Номенклатура")).toBeDefined();
    expect(screen.getByText("Продано")).toBeDefined();
    // Номер — лінк на замовлення.
    const link = screen.getByRole("link", { name: "L0000000001" });
    expect(link.getAttribute("href")).toBe("/manager/orders/ord-1");
  });

  it("чекбокс позиції викликає onToggleItem", () => {
    const onToggleItem = vi.fn();
    render(
      <ClosuresTable
        orders={[makeOrder()]}
        selected={new Set()}
        onToggleItem={onToggleItem}
        onToggleOrder={noop}
        onCloseOrder={noop}
        closingOrderId={null}
      />,
    );
    fireEvent.click(screen.getByLabelText("Додати Mix A у нове замовлення"));
    expect(onToggleItem).toHaveBeenCalledWith("ord-1", "p-1");
  });

  it("кнопка «Закрити замовлення» викликає onCloseOrder", () => {
    const onCloseOrder = vi.fn();
    render(
      <ClosuresTable
        orders={[makeOrder()]}
        selected={new Set()}
        onToggleItem={noop}
        onToggleOrder={noop}
        onCloseOrder={onCloseOrder}
        closingOrderId={null}
      />,
    );
    fireEvent.click(screen.getByText("❌ Закрити замовлення"));
    expect(onCloseOrder).toHaveBeenCalledWith("ord-1");
  });

  it("підсвічує повністю продані позиції (data-fully-sold)", () => {
    render(
      <ClosuresTable
        orders={[
          makeOrder({
            items: [
              {
                productUid: "p-1",
                productName: "A",
                articleCode: null,
                quantity: 50,
                weight: 100,
                unitPriceEur: 1,
                sum: 50,
                sold: 50,
                fullySold: true,
              },
            ],
          }),
        ]}
        selected={new Set()}
        onToggleItem={noop}
        onToggleOrder={noop}
        onCloseOrder={noop}
        closingOrderId={null}
      />,
    );
    const rows = document.querySelectorAll("tr[data-fully-sold]");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-fully-sold")).toBe("true");
  });

  it("не показує «Закрити» для неможливих до закриття", () => {
    render(
      <ClosuresTable
        orders={[makeOrder({ closable: false })]}
        selected={new Set()}
        onToggleItem={noop}
        onToggleOrder={noop}
        onCloseOrder={noop}
        closingOrderId={null}
      />,
    );
    expect(screen.queryByText("❌ Закрити замовлення")).toBeNull();
  });

  it("itemKey формує стабільний ключ", () => {
    expect(itemKey("o1", "p1")).toBe("o1::p1");
  });
});
