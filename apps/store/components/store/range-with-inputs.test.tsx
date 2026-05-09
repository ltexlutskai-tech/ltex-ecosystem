import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { RangeWithInputs } from "./range-with-inputs";

afterEach(() => {
  cleanup();
});

describe("RangeWithInputs", () => {
  it("renders both number inputs and slider thumbs", () => {
    render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 80]}
        onChange={() => {}}
        onCommit={() => {}}
        ariaLabelMin="Шт від"
        ariaLabelMax="Шт до"
        unit="шт"
      />,
    );

    const minInputs = screen.getAllByLabelText("Шт від") as HTMLInputElement[];
    const maxInputs = screen.getAllByLabelText("Шт до") as HTMLInputElement[];

    expect(minInputs).toHaveLength(2);
    expect(maxInputs).toHaveLength(2);

    const numberInput = minInputs.find((el) => el.type === "number");
    const rangeInput = minInputs.find((el) => el.type === "range");
    expect(numberInput?.value).toBe("10");
    expect(rangeInput?.value).toBe("10");
    expect(screen.getByText("10 шт")).toBeTruthy();
    expect(screen.getByText("80 шт")).toBeTruthy();
  });

  it("commits on blur with the typed min value", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 80]}
        onChange={onChange}
        onCommit={onCommit}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    const minNumberInput = screen
      .getAllByLabelText("min")
      .find((el) => (el as HTMLInputElement).type === "number") as
      | HTMLInputElement
      | undefined;
    expect(minNumberInput).toBeTruthy();

    fireEvent.change(minNumberInput!, { target: { value: "5" } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(minNumberInput!);
    expect(onChange).toHaveBeenCalledWith([5, 80]);
    expect(onCommit).toHaveBeenCalledWith([5, 80]);
  });

  it("clamps typed values above max to max", () => {
    const onCommit = vi.fn();
    render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 50]}
        onChange={() => {}}
        onCommit={onCommit}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    const maxNumberInput = screen
      .getAllByLabelText("max")
      .find((el) => (el as HTMLInputElement).type === "number") as
      | HTMLInputElement
      | undefined;

    fireEvent.change(maxNumberInput!, { target: { value: "999" } });
    fireEvent.blur(maxNumberInput!);

    expect(onCommit).toHaveBeenCalledWith([10, 100]);
  });

  it("reorders when min input is typed higher than current max (swap)", () => {
    const onCommit = vi.fn();
    render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 50]}
        onChange={() => {}}
        onCommit={onCommit}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    const minNumberInput = screen
      .getAllByLabelText("min")
      .find((el) => (el as HTMLInputElement).type === "number") as
      | HTMLInputElement
      | undefined;

    fireEvent.change(minNumberInput!, { target: { value: "80" } });
    fireEvent.blur(minNumberInput!);

    expect(onCommit).toHaveBeenCalledWith([50, 80]);
  });

  it("falls back to current value when input is non-numeric (noop, no commit)", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 50]}
        onChange={onChange}
        onCommit={onCommit}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    const minNumberInput = screen
      .getAllByLabelText("min")
      .find((el) => (el as HTMLInputElement).type === "number") as
      | HTMLInputElement
      | undefined;

    fireEvent.change(minNumberInput!, { target: { value: "" } });
    fireEvent.blur(minNumberInput!);

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("skips onCommit when blur happens without an edit (noop)", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 50]}
        onChange={onChange}
        onCommit={onCommit}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    const minNumberInput = screen
      .getAllByLabelText("min")
      .find((el) => (el as HTMLInputElement).type === "number") as
      | HTMLInputElement
      | undefined;

    fireEvent.blur(minNumberInput!);

    expect(onChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits on Enter keypress (via blur)", () => {
    const onCommit = vi.fn();
    render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 80]}
        onChange={() => {}}
        onCommit={onCommit}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    const minNumberInput = screen
      .getAllByLabelText("min")
      .find((el) => (el as HTMLInputElement).type === "number") as
      | HTMLInputElement
      | undefined;

    minNumberInput!.focus();
    fireEvent.change(minNumberInput!, { target: { value: "20" } });
    fireEvent.keyDown(minNumberInput!, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith([20, 80]);
  });

  it("syncs input drafts when external value changes (slider drag)", () => {
    const { rerender } = render(
      <RangeWithInputs
        min={0}
        max={100}
        value={[10, 80]}
        onChange={() => {}}
        onCommit={() => {}}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    const minNumberInput = () =>
      screen
        .getAllByLabelText("min")
        .find((el) => (el as HTMLInputElement).type === "number") as
        | HTMLInputElement
        | undefined;

    expect(minNumberInput()?.value).toBe("10");

    rerender(
      <RangeWithInputs
        min={0}
        max={100}
        value={[25, 80]}
        onChange={() => {}}
        onCommit={() => {}}
        ariaLabelMin="min"
        ariaLabelMax="max"
      />,
    );

    expect(minNumberInput()?.value).toBe("25");
  });
});
