import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
    status: "open",
    ...overrides,
  };
}

describe("ClosuresTable", () => {
  it("рендерить рядки з колонками", () => {
    const rows = [
      makeRow({ productName: "Mix A" }),
      makeRow({ orderUid: "u-2", productUid: "p-2", productName: "Mix B" }),
    ];
    render(<ClosuresTable rows={rows} />);
    expect(screen.getByText("Mix A")).toBeDefined();
    expect(screen.getByText("Mix B")).toBeDefined();
    // Заголовки колонок
    expect(screen.getByText("Замовлення")).toBeDefined();
    expect(screen.getByText("Продано")).toBeDefined();
    // Чекбокс «Додати в нове» прибрано (SOAP-закриття скасовано).
    expect(screen.queryByText("Додати в нове")).toBeNull();
  });

  it("підсвічує рядки де sold >= quantity (green BG)", () => {
    const rows = [
      makeRow({ orderUid: "u-1", quantity: 100, sold: 25 }), // not fully sold
      makeRow({ orderUid: "u-2", quantity: 50, sold: 50 }), // fully sold
      makeRow({ orderUid: "u-3", quantity: 30, sold: 35 }), // over-sold
    ];
    render(<ClosuresTable rows={rows} />);
    const trs = document.querySelectorAll("tr[data-fully-sold]");
    expect(trs).toHaveLength(3);
    expect(trs[0]?.getAttribute("data-fully-sold")).toBe("false");
    expect(trs[1]?.getAttribute("data-fully-sold")).toBe("true");
    expect(trs[2]?.getAttribute("data-fully-sold")).toBe("true");
  });

  it("номер замовлення — лінк на сторінку замовлення", () => {
    const rows = [
      makeRow({ orderUid: "order-abc", orderNumber: "L-2026-009" }),
    ];
    render(<ClosuresTable rows={rows} />);
    const link = screen.getByRole("link", { name: "L-2026-009" });
    expect(link.getAttribute("href")).toBe("/manager/orders/order-abc");
  });
});
