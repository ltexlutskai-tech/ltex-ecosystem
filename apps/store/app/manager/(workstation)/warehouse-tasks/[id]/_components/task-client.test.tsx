import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  saleCashOnDelivery?: boolean;
  receiptStatus?: string | null;
  receiptError?: string | null;
  npCityRef?: string | null;
  npWarehouseRef?: string | null;
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
    saleCashOnDelivery: o.saleCashOnDelivery ?? false,
    receiptStatus: o.receiptStatus ?? null,
    receiptError: o.receiptError ?? null,
    npCityRef: o.npCityRef === undefined ? "city-ref-1" : o.npCityRef,
    npCityName: "Луцьк (Волинська)",
    npWarehouseRef:
      o.npWarehouseRef === undefined ? "wh-ref-1" : o.npWarehouseRef,
    npWarehouseName: "Відділення №5",
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
        ttnDraft={false}
        ttnStatusText={null}
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
        ttnDraft={false}
        ttnStatusText={null}
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
      <WarehouseTaskClient
        canAct
        ttnDraft={false}
        ttnStatusText={null}
        task={makeTask({ saleTtnRef: "ref-1" })}
      />,
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
        ttnDraft={false}
        ttnStatusText={null}
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

  it("відправлене + чернетка ТТН — редактор місць і друк лишаються доступні", () => {
    render(
      <WarehouseTaskClient
        canAct
        ttnDraft
        ttnStatusText="Чернетка"
        task={makeTask({ status: "sent", saleTtnRef: "ref-1" })}
      />,
    );
    // Редактор місць (SeatsEditor) присутній.
    expect(
      screen.getByRole("button", { name: /Зберегти місця й оновити ТТН/ }),
    ).toBeDefined();
    // Друк етикетки лишається доступним.
    expect(screen.getByRole("button", { name: /Друк етикетки/ })).toBeDefined();
  });

  it("відправлене + ТТН у дорозі — місця read-only з підказкою", () => {
    render(
      <WarehouseTaskClient
        canAct
        ttnDraft={false}
        ttnStatusText="Прямує до відділення"
        task={makeTask({ status: "sent", saleTtnRef: "ref-1" })}
      />,
    );
    // Нотатка саме редактора місць (щоб не збігтися з блоком відділення НП).
    expect(
      screen.getByText(/ТТН уже в дорозі.*зміни недоступні/),
    ).toBeDefined();
    expect(
      screen.queryByRole("button", { name: /Зберегти місця й оновити ТТН/ }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /Друк етикетки/ })).toBeNull();
  });
});

describe("WarehouseTaskClient — індикатор чека Checkbox (COD)", () => {
  it("НЕ показує чек для не-COD завдання", () => {
    render(
      <WarehouseTaskClient
        canAct
        ttnDraft={false}
        ttnStatusText={null}
        task={makeTask({ status: "sent", saleCashOnDelivery: false })}
      />,
    );
    expect(screen.queryByText(/Чек Checkbox/)).toBeNull();
  });

  it("COD + created → зелений «створено», без кнопки", () => {
    render(
      <WarehouseTaskClient
        canAct
        ttnDraft={false}
        ttnStatusText={null}
        task={makeTask({
          status: "sent",
          saleCashOnDelivery: true,
          receiptStatus: "created",
        })}
      />,
    );
    expect(screen.getByText(/Чек Checkbox створено/)).toBeDefined();
    expect(screen.queryByRole("button", { name: /Повторити чек/ })).toBeNull();
  });

  it("COD + failed → «не створено» + кнопка «Повторити чек» → POST + refresh", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, status: "created" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WarehouseTaskClient
        canAct
        ttnDraft={false}
        ttnStatusText={null}
        task={makeTask({
          status: "sent",
          saleCashOnDelivery: true,
          receiptStatus: "failed",
          receiptError: "збій",
        })}
      />,
    );
    expect(screen.getByText(/Чек не створено/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Повторити чек/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/manager/sales/s1/create-receipt",
        { method: "POST" },
      );
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe("WarehouseTaskClient — зміна відділення отримувача НП", () => {
  it("зберігає відділення → POST recipient-warehouse + показує ТТН + refresh", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/recipient-warehouse")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            ttn: { ok: true, number: "59000000000009" },
          }),
        });
      }
      // Довідник НП на монтуванні пікера — порожній список.
      return Promise.resolve({
        ok: true,
        json: async () => ({ warehouses: [], cities: [] }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WarehouseTaskClient
        canAct
        ttnDraft={false}
        ttnStatusText={null}
        task={makeTask()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Зберегти відділення/ }),
    );

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        c[0].includes("/recipient-warehouse"),
      );
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find((c) =>
      c[0].includes("/recipient-warehouse"),
    );
    expect(call?.[0]).toBe(
      "/api/v1/manager/warehouse-tasks/t1/recipient-warehouse",
    );
    expect(call?.[1]?.method).toBe("POST");
    const body = JSON.parse((call?.[1]?.body as string) ?? "{}") as {
      npCityRef: string;
      npWarehouseRef: string;
    };
    expect(body.npCityRef).toBe("city-ref-1");
    expect(body.npWarehouseRef).toBe("wh-ref-1");

    await waitFor(() =>
      expect(screen.getByText(/ТТН оновлено: 59000000000009/)).toBeDefined(),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("менеджер (canAct=false) не бачить блок зміни відділення", () => {
    render(
      <WarehouseTaskClient
        canAct={false}
        ttnDraft={false}
        ttnStatusText={null}
        task={makeTask()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Зберегти відділення/ }),
    ).toBeNull();
  });
});
