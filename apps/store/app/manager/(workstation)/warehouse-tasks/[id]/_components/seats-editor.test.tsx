import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SeatsEditor, type SeatInit } from "./seats-editor";

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
  };
});

afterEach(() => cleanup());
beforeEach(() => {
  refresh.mockClear();
  vi.unstubAllGlobals();
});

/** Кількість рядків місць = к-сть полів «Вага місця N». */
function seatRowCount(): number {
  return screen.getAllByLabelText(/Вага місця/).length;
}

describe("SeatsEditor", () => {
  it("стартує з одного порожнього рядка коли місць немає", () => {
    render(<SeatsEditor taskId="t1" initialSeats={[]} />);
    expect(seatRowCount()).toBe(1);
  });

  it("«Додати місце» додає рядок", () => {
    render(<SeatsEditor taskId="t1" initialSeats={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Додати місце/ }));
    expect(seatRowCount()).toBe(2);
  });

  it("пресет «Палета» додає рядок із габаритами 120×80×80", () => {
    render(<SeatsEditor taskId="t1" initialSeats={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Палета" }));
    expect(seatRowCount()).toBe(2);
    const lengths = screen.getAllByLabelText(
      /Довжина місця/,
    ) as HTMLInputElement[];
    expect(lengths[1]?.value).toBe("120");
    const widths = screen.getAllByLabelText(
      /Ширина місця/,
    ) as HTMLInputElement[];
    expect(widths[1]?.value).toBe("80");
  });

  it("видаляє рядок, але не останній", () => {
    render(<SeatsEditor taskId="t1" initialSeats={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Додати місце/ }));
    expect(seatRowCount()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: /Видалити місце 2/ }));
    expect(seatRowCount()).toBe(1);
    // Кнопка видалення для єдиного рядка disabled.
    const del = screen.getByRole("button", { name: /Видалити місце 1/ });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it("зберігає місця правильним body та показує номер ТТН", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        ttn: { ok: true, number: "59000000000009" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const seats: SeatInit[] = [
      {
        id: "s1",
        weight: 10,
        lengthCm: 60,
        widthCm: 40,
        heightCm: 40,
        manualHandling: false,
        note: null,
      },
    ];
    render(<SeatsEditor taskId="t1" initialSeats={seats} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Зберегти місця й оновити ТТН/ }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(call[0]).toBe("/api/v1/manager/warehouse-tasks/t1/seats");
    expect(JSON.parse(call[1].body)).toEqual({
      seats: [
        {
          weight: 10,
          lengthCm: 60,
          widthCm: 40,
          heightCm: 40,
          manualHandling: false,
          note: null,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText(/59000000000009/)).toBeDefined();
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("ініціалізує чекбокс «Ручна обробка» з даних місця", () => {
    const seats: SeatInit[] = [
      {
        id: "s1",
        weight: 10,
        lengthCm: 60,
        widthCm: 40,
        heightCm: 40,
        manualHandling: true,
        note: null,
      },
    ];
    render(<SeatsEditor taskId="t1" initialSeats={seats} />);
    const cb = screen.getByLabelText(
      /Ручна обробка місця 1/,
    ) as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it("перемикає «Ручна обробка» та включає його у body запиту", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        ttn: { ok: true, number: "59000000000010" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const seats: SeatInit[] = [
      {
        id: "s1",
        weight: 10,
        lengthCm: 60,
        widthCm: 40,
        heightCm: 40,
        manualHandling: false,
        note: null,
      },
    ];
    render(<SeatsEditor taskId="t1" initialSeats={seats} />);

    const cb = screen.getByLabelText(
      /Ручна обробка місця 1/,
    ) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(cb.checked).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /Зберегти місця й оновити ТТН/ }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(call[1].body) as {
      seats: { manualHandling: boolean }[];
    };
    expect(body.seats[0]?.manualHandling).toBe(true);
  });

  it("показує помилку оновлення ТТН", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        ttn: { ok: false, error: "місто не знайдено" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SeatsEditor taskId="t1" initialSeats={[]} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Зберегти місця й оновити ТТН/ }),
    );

    await waitFor(() => {
      expect(screen.getByText(/місто не знайдено/)).toBeDefined();
    });
  });
});
