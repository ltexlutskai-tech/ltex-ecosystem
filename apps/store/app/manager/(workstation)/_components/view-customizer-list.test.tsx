import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ViewCustomizerList } from "./view-customizer-list";

afterEach(() => cleanup());

const ITEMS = [
  { key: "name", visible: true, order: 1 },
  { key: "debt", visible: false, order: 2 },
  { key: "agent", visible: true, order: 3 },
];

const LABELS = { name: "Найменування", debt: "Борг", agent: "Агент" };

describe("ViewCustomizerList", () => {
  it("renders items in given order з labels", () => {
    render(
      <ViewCustomizerList items={ITEMS} labels={LABELS} onChange={() => {}} />,
    );
    expect(screen.getByText("Найменування")).toBeDefined();
    expect(screen.getByText("Борг")).toBeDefined();
    expect(screen.getByText("Агент")).toBeDefined();
  });

  it("toggleVisible — нова items array з оновленим прапором", () => {
    const onChange = vi.fn();
    render(
      <ViewCustomizerList items={ITEMS} labels={LABELS} onChange={onChange} />,
    );
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes[0]?.checked).toBe(true);
    fireEvent.click(checkboxes[0]!);
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0]?.[0] as typeof ITEMS;
    expect(arg[0]?.visible).toBe(false);
  });

  it("move down swaps adjacent items + renumbers order", () => {
    const onChange = vi.fn();
    render(
      <ViewCustomizerList items={ITEMS} labels={LABELS} onChange={onChange} />,
    );
    // Кнопка ▼ перша → item idx=0
    const down = screen.getAllByLabelText(/Перемістити Найменування вниз/)[0]!;
    fireEvent.click(down);
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0]?.[0] as typeof ITEMS;
    expect(arg[0]?.key).toBe("debt");
    expect(arg[1]?.key).toBe("name");
    expect(arg[0]?.order).toBe(1);
    expect(arg[1]?.order).toBe(2);
  });

  it("up disabled на першому item, down disabled на останньому", () => {
    render(
      <ViewCustomizerList items={ITEMS} labels={LABELS} onChange={() => {}} />,
    );
    const ups = screen.getAllByLabelText(/Перемістити .* вгору/);
    const downs = screen.getAllByLabelText(/Перемістити .* вниз/);
    expect((ups[0] as HTMLButtonElement).disabled).toBe(true);
    expect((downs[downs.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });

  it("disabled=true — усі controls disabled", () => {
    render(
      <ViewCustomizerList
        items={ITEMS}
        labels={LABELS}
        onChange={() => {}}
        disabled
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.every((c) => c.disabled)).toBe(true);
  });
});
