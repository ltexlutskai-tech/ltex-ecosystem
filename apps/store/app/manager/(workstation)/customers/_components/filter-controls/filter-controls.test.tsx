import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TextFilter } from "./text-filter";
import { BoolFilter } from "./bool-filter";
import { RangeNumeric } from "./range-numeric";
import { RangeDate } from "./range-date";
import { DateBefore } from "./date-before";
import { SelectMulti } from "./select-multi";

afterEach(() => cleanup());

describe("TextFilter", () => {
  it("renders label + value, calls onChange on input", () => {
    const onChange = vi.fn();
    render(<TextFilter label="Область" value="Київ" onChange={onChange} />);
    expect(screen.getByText("Область")).toBeDefined();
    const input = screen.getByDisplayValue("Київ") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Львів" } });
    expect(onChange).toHaveBeenCalledWith("Львів");
  });
});

describe("BoolFilter", () => {
  it("renders 3 buttons + active state for true", () => {
    const onChange = vi.fn();
    render(
      <BoolFilter label="Нове повідомлення" value={true} onChange={onChange} />,
    );
    expect(screen.getByText("Так")).toBeDefined();
    expect(screen.getByText("Ні")).toBeDefined();
    expect(screen.getByText("Усі")).toBeDefined();
    fireEvent.click(screen.getByText("Ні"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("clicking 'Усі' resets to undefined", () => {
    const onChange = vi.fn();
    render(<BoolFilter label="X" value={true} onChange={onChange} />);
    fireEvent.click(screen.getByText("Усі"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("RangeNumeric", () => {
  it("calls onChange with updated min keeping max", () => {
    const onChange = vi.fn();
    render(
      <RangeNumeric
        label="Борг"
        unit="₴"
        min={100}
        max={5000}
        onChange={onChange}
      />,
    );
    const inputs = screen.getAllByPlaceholderText(
      /мін|макс/,
    ) as HTMLInputElement[];
    fireEvent.change(inputs[0]!, { target: { value: "250" } });
    expect(onChange).toHaveBeenCalledWith({ min: 250, max: 5000 });
  });

  it("empty string → undefined", () => {
    const onChange = vi.fn();
    render(
      <RangeNumeric label="X" min={100} max={undefined} onChange={onChange} />,
    );
    const inputs = screen.getAllByPlaceholderText(
      /мін|макс/,
    ) as HTMLInputElement[];
    fireEvent.change(inputs[0]!, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith({ min: undefined, max: undefined });
  });
});

describe("RangeDate", () => {
  it("changing 'from' calls onChange with new from", () => {
    const onChange = vi.fn();
    render(
      <RangeDate
        label="Створено"
        from={undefined}
        to={undefined}
        onChange={onChange}
      />,
    );
    const inputs = screen.getAllByDisplayValue("") as HTMLInputElement[];
    fireEvent.change(inputs[0]!, { target: { value: "2026-01-01" } });
    expect(onChange).toHaveBeenCalledWith({
      from: "2026-01-01",
      to: undefined,
    });
  });
});

describe("DateBefore", () => {
  it("renders + emits value", () => {
    const onChange = vi.fn();
    render(
      <DateBefore label="Ліцензія до" value="2026-12-31" onChange={onChange} />,
    );
    const input = screen.getByDisplayValue("2026-12-31") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2027-01-01" } });
    expect(onChange).toHaveBeenCalledWith("2027-01-01");
  });
});

describe("SelectMulti", () => {
  const OPTIONS = [
    { id: "a", label: "Альфа" },
    { id: "b", label: "Бета" },
    { id: "c", label: "Гамма" },
  ];

  it("renders selected chips", () => {
    const onChange = vi.fn();
    render(
      <SelectMulti
        label="Статус"
        options={OPTIONS}
        value={["a", "b"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Альфа")).toBeDefined();
    expect(screen.getByText("Бета")).toBeDefined();
  });

  it("opens dropdown + toggles option", () => {
    const onChange = vi.fn();
    render(
      <SelectMulti
        label="Статус"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
      />,
    );
    // open
    fireEvent.click(screen.getByText("Статус").nextElementSibling!);
    // option 'Гамма' появилась
    fireEvent.click(screen.getByText("Гамма"));
    expect(onChange).toHaveBeenCalledWith(["c"]);
  });

  it("placeholder coли value пустий", () => {
    const onChange = vi.fn();
    render(
      <SelectMulti
        label="X"
        options={OPTIONS}
        value={[]}
        onChange={onChange}
        placeholder="Усі"
      />,
    );
    expect(screen.getByText("Усі")).toBeDefined();
  });
});
