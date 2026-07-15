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

  it("drag-and-drop переставляє елементи + перенумеровує order", () => {
    const onChange = vi.fn();
    render(
      <ViewCustomizerList items={ITEMS} labels={LABELS} onChange={onChange} />,
    );
    const rows = screen.getAllByRole("listitem");
    // Перетягуємо «Найменування» (idx 0) на позицію «Борг» (idx 1).
    fireEvent.dragStart(rows[0]!);
    fireEvent.dragOver(rows[1]!);
    fireEvent.drop(rows[1]!);
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls.at(-1)?.[0] as typeof ITEMS;
    expect(arg[0]?.key).toBe("debt");
    expect(arg[1]?.key).toBe("name");
    expect(arg[0]?.order).toBe(1);
    expect(arg[1]?.order).toBe(2);
  });

  it("disabled=true — рядки не draggable + чекбокси disabled", () => {
    render(
      <ViewCustomizerList
        items={ITEMS}
        labels={LABELS}
        onChange={() => {}}
        disabled
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows.every((r) => r.getAttribute("draggable") === "false")).toBe(
      true,
    );
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.every((c) => c.disabled)).toBe(true);
  });
});
