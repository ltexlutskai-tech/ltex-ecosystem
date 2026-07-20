import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NpTtnStatus } from "./np-ttn-status";

const refresh = vi.fn();

// next/navigation — useRouter (refresh) заглушка.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

// @ltex/ui — Button достатньо реального (нативний <button>).
vi.mock("@ltex/ui", async () => {
  const React = await import("react");
  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", props, children),
  };
});

afterEach(() => cleanup());

beforeEach(() => {
  refresh.mockClear();
  vi.unstubAllGlobals();
});

describe("NpTtnStatus", () => {
  it("показує номер ТТН + посилання відстеження коли ТТН створена", () => {
    render(
      <NpTtnStatus
        saleId="s1"
        ttnRef="ref-1"
        ttnNumber="59000000000001"
        ttnError={null}
        posted
      />,
    );
    expect(screen.getByText("59000000000001")).toBeDefined();
    const link = screen.getByText("Відстежити").closest("a");
    expect(link?.getAttribute("href")).toContain("cargo_number=59000000000001");
  });

  it("показує помилку + кнопку повтору коли ttnError", () => {
    render(
      <NpTtnStatus
        saleId="s1"
        ttnRef={null}
        ttnNumber={null}
        ttnError="місто не знайдено"
        posted
      />,
    );
    expect(screen.getByText(/місто не знайдено/)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Повторити створення ТТН/ }),
    ).toBeDefined();
  });

  it("POST-ить на create-ttn і рефрешить при повторі", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ttnRef: "ref-2",
        ttnNumber: "59000000000002",
        ttnError: null,
        ok: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NpTtnStatus
        saleId="s1"
        ttnRef={null}
        ttnNumber={null}
        ttnError="збій"
        posted
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Повторити створення ТТН/ }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/manager/sales/s1/create-ttn",
        { method: "POST" },
      );
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("показує повернену помилку коли повтор не вдався", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ttnRef: null,
        ttnNumber: null,
        ttnError: "невірний телефон",
        ok: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NpTtnStatus
        saleId="s1"
        ttnRef={null}
        ttnNumber={null}
        ttnError="збій"
        posted
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Повторити створення ТТН/ }),
    );

    await waitFor(() => {
      expect(screen.getByText("невірний телефон")).toBeDefined();
    });
  });

  it("показує «ТТН створюється…» + «Створити ТТН» коли проведено без ТТН/помилки", () => {
    render(
      <NpTtnStatus
        saleId="s1"
        ttnRef={null}
        ttnNumber={null}
        ttnError={null}
        posted
      />,
    );
    expect(screen.getByText(/ТТН створюється/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Створити ТТН/ })).toBeDefined();
  });
});
