import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClosuresTable, type ClosureRow } from "./closures-table";

afterEach(() => cleanup());

function makeRow(overrides: Partial<ClosureRow> = {}): ClosureRow {
  return {
    orderUid: "u-1",
    orderNumber: "L-2026-001",
    orderDate: "2026-05-01T00:00:00",
    productUid: "p-1",
    productName: "Test Mix UK",
    quantity: 100,
    sum: 5000,
    sold: 25,
    status: "Новий",
    ...overrides,
  };
}

describe("ClosuresTable", () => {
  it("рендерить рядки з 1С-подібними колонками", () => {
    const rows = [
      makeRow({ productName: "Mix A" }),
      makeRow({ orderUid: "u-2", productUid: "p-2", productName: "Mix B" }),
    ];
    render(
      <ClosuresTable
        rows={rows}
        addToNewOrder={{}}
        onToggleAddToNew={() => {}}
      />,
    );
    expect(screen.getByText("Mix A")).toBeDefined();
    expect(screen.getByText("Mix B")).toBeDefined();
    // Заголовки колонок
    expect(screen.getByText("Замовлення")).toBeDefined();
    expect(screen.getByText("Продано")).toBeDefined();
    expect(screen.getByText("Додати в нове")).toBeDefined();
  });

  it("підсвічує рядки де sold >= quantity (green BG, як у 1С v0)", () => {
    const rows = [
      makeRow({ orderUid: "u-1", quantity: 100, sold: 25 }), // not fully sold
      makeRow({ orderUid: "u-2", quantity: 50, sold: 50 }), // fully sold
      makeRow({ orderUid: "u-3", quantity: 30, sold: 35 }), // over-sold
    ];
    render(
      <ClosuresTable
        rows={rows}
        addToNewOrder={{}}
        onToggleAddToNew={() => {}}
      />,
    );
    const trs = document.querySelectorAll("tr[data-fully-sold]");
    expect(trs).toHaveLength(3);
    expect(trs[0]?.getAttribute("data-fully-sold")).toBe("false");
    expect(trs[1]?.getAttribute("data-fully-sold")).toBe("true");
    expect(trs[2]?.getAttribute("data-fully-sold")).toBe("true");
  });

  it("чекбокс додавання у нове замовлення викликає onToggleAddToNew з ключем", () => {
    const onToggle = vi.fn();
    const rows = [makeRow({ orderUid: "uA", productUid: "pA" })];
    render(
      <ClosuresTable
        rows={rows}
        addToNewOrder={{}}
        onToggleAddToNew={onToggle}
      />,
    );
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith("uA::pA", true);
  });

  it("checked-state відображається коли передано у addToNewOrder", () => {
    const rows = [
      makeRow({ orderUid: "uX", productUid: "pX" }),
      makeRow({ orderUid: "uY", productUid: "pY" }),
    ];
    render(
      <ClosuresTable
        rows={rows}
        addToNewOrder={{ "uX::pX": true }}
        onToggleAddToNew={() => {}}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]?.checked).toBe(true);
    expect(checkboxes[1]?.checked).toBe(false);
  });
});
