import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListContextMenu, type ContextMenuItem } from "./list-context-menu";

afterEach(() => cleanup());

describe("ListContextMenu", () => {
  it("рендерить пункти-дії, розділювач та виконує onSelect+onClose", () => {
    const open = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [
      { type: "action", label: "Відкрити", onSelect: open },
      { type: "separator" },
      { type: "action", label: "Оновити", onSelect: () => {} },
    ];
    render(
      <ListContextMenu open x={10} y={10} items={items} onClose={onClose} />,
    );

    expect(screen.getByText("Відкрити")).toBeDefined();
    expect(screen.getByText("Оновити")).toBeDefined();
    // 2 action items rendered as menuitems
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);

    fireEvent.click(screen.getByText("Відкрити"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("не виконує onSelect для disabled-пункту", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const items: ContextMenuItem[] = [
      { type: "action", label: "Видалити", onSelect, disabled: true },
    ];
    render(
      <ListContextMenu open x={5} y={5} items={items} onClose={onClose} />,
    );

    const btn = screen.getByText("Видалити") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("нічого не рендерить коли open=false", () => {
    const { container } = render(
      <ListContextMenu
        open={false}
        x={0}
        y={0}
        items={[{ type: "action", label: "Х", onSelect: () => {} }]}
        onClose={() => {}}
      />,
    );
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(screen.queryByText("Х")).toBeNull();
  });
});
