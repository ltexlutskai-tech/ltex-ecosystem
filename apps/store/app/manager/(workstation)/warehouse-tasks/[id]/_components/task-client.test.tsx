import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarehouseTaskClient } from "./task-client";
import type { SeatInit } from "./seats-editor";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

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

interface Overrides {
  status?: string;
  saleTtnRef?: string | null;
  labelPrintedAt?: string | null;
  deliveryMethod?: string | null;
  packed?: boolean;
  seats?: SeatInit[];
}

function makeTask(o: Overrides = {}) {
  return {
    id: "t1",
    status: o.status ?? "received",
    customerName: "ТОВ Тест",
    deliveryLabel: "Нова Пошта",
    deliveryMethod: o.deliveryMethod ?? "post",
    novaPoshtaBranch: "5",
    expressWaybill: "59000000000001",
    deliveryAddress: null,
    managerName: "Менеджер",
    comment: null,
    receivedByName: null,
    receivedAt: null,
    sentByName: null,
    sentAt: null,
    labelPrintedAt: o.labelPrintedAt ?? null,
    saleId: "s1",
    saleNumber: "L1",
    saleTtnRef: o.saleTtnRef === undefined ? "ref-1" : o.saleTtnRef,
    saleExpressWaybill: "59000000000001",
    seats: o.seats ?? [],
    items: [
      {
        id: "i1",
        productName: "Товар",
        articleCode: "A1",
        barcode: "B1",
        sector: "S1",
        quantity: 1,
        weight: 10,
        packed: o.packed ?? true,
      },
    ],
  };
}

afterEach(() => cleanup());
beforeEach(() => {
  refresh.mockClear();
  vi.unstubAllGlobals();
});

describe("WarehouseTaskClient — НП етикетка та gating «Готово»", () => {
  it("«Готово» disabled без labelPrintedAt для НП + підказка", () => {
    render(
      <WarehouseTaskClient
        canAct
        task={makeTask({ saleTtnRef: "ref-1", labelPrintedAt: null })}
      />,
    );
    const done = screen.getByRole("button", {
      name: /Запаковано \+ ТТН — відправлено/,
    });
    expect((done as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Спершу надрукуйте етикетку/)).toBeDefined();
  });

  it("«Готово» enabled коли етикетку надруковано + показує індикатор", () => {
    render(
      <WarehouseTaskClient
        canAct
        task={makeTask({
          saleTtnRef: "ref-1",
          labelPrintedAt: new Date().toISOString(),
        })}
      />,
    );
    const done = screen.getByRole("button", {
      name: /Запаковано \+ ТТН — відправлено/,
    });
    expect((done as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Етикетку надруковано/)).toBeDefined();
  });

  it("«Друк етикетки» відкриває label-роут у новій вкладці", () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    render(
      <WarehouseTaskClient canAct task={makeTask({ saleTtnRef: "ref-1" })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Друк етикетки/ }));
    expect(openMock).toHaveBeenCalledWith(
      "/api/v1/manager/warehouse-tasks/t1/label",
      "_blank",
    );
  });

  it("для НЕ-Нової-Пошти (самовивіз без ТТН) немає друку етикетки й gating", () => {
    render(
      <WarehouseTaskClient
        canAct
        task={makeTask({
          deliveryMethod: "pickup",
          saleTtnRef: null,
        })}
      />,
    );
    expect(screen.queryByRole("button", { name: /Друк етикетки/ })).toBeNull();
    // Без НП «Готово» залежить лише від запакування (усе запаковано) → enabled.
    const done = screen.getByRole("button", {
      name: /Запаковано \+ ТТН — відправлено/,
    });
    expect((done as HTMLButtonElement).disabled).toBe(false);
  });
});
