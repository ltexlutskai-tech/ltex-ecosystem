import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CheckboxReceiptStatus } from "./checkbox-receipt-status";

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
  };
});

afterEach(() => cleanup());
beforeEach(() => {
  refresh.mockClear();
  vi.unstubAllGlobals();
});

describe("CheckboxReceiptStatus — статус чека Checkbox", () => {
  it("status=created → зелений «створено» + receiptId, без кнопки", () => {
    render(
      <CheckboxReceiptStatus
        saleId="s1"
        status="created"
        receiptId="rcpt-42"
        error={null}
        hasTtn
      />,
    );
    expect(screen.getByText(/Чек Checkbox створено/)).toBeDefined();
    expect(screen.getByText("rcpt-42")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Повторити чек/ })).toBeNull();
  });

  it("status=failed → червоний + помилка + кнопка «Повторити чек»", () => {
    render(
      <CheckboxReceiptStatus
        saleId="s1"
        status="failed"
        receiptId={null}
        error="API 500"
        hasTtn
      />,
    );
    expect(screen.getByText(/Чек не створено: API 500/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Повторити чек/ })).toBeDefined();
  });

  it("є ТТН, але чека немає (null) → червоний + кнопка", () => {
    render(
      <CheckboxReceiptStatus
        saleId="s1"
        status={null}
        receiptId={null}
        error={null}
        hasTtn
      />,
    );
    expect(screen.getByText(/Чек не створено/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Повторити чек/ })).toBeDefined();
  });

  it("немає ТТН → підказка, без кнопки", () => {
    render(
      <CheckboxReceiptStatus
        saleId="s1"
        status={null}
        receiptId={null}
        error={null}
        hasTtn={false}
      />,
    );
    expect(
      screen.getByText(/Чек створиться після відправлення складом/),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Повторити чек/ })).toBeNull();
  });

  it("«Повторити чек» → POST на правильний URL + router.refresh()", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, status: "created" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CheckboxReceiptStatus
        saleId="s1"
        status="failed"
        receiptId={null}
        error="збій"
        hasTtn
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Повторити чек/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/manager/sales/s1/create-receipt",
        { method: "POST" },
      );
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("«Повторити чек» при помилці сервера → показує повернену помилку", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: "Checkbox недоступний" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CheckboxReceiptStatus
        saleId="s1"
        status="failed"
        receiptId={null}
        error="старий"
        hasTtn
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Повторити чек/ }));

    await waitFor(() =>
      expect(screen.getByText(/Checkbox недоступний/)).toBeDefined(),
    );
  });
});
