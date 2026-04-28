import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PriceRangeSlider } from "./price-range-slider";

afterEach(() => {
  cleanup();
});

describe("PriceRangeSlider", () => {
  it("renders both thumbs with the current values shown", () => {
    render(
      <PriceRangeSlider
        min={0}
        max={100}
        value={[10, 80]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("10 €")).toBeTruthy();
    expect(screen.getByText("80 €")).toBeTruthy();
    const minInput = screen.getByLabelText(
      "Мінімальна ціна",
    ) as HTMLInputElement;
    const maxInput = screen.getByLabelText(
      "Максимальна ціна",
    ) as HTMLInputElement;
    expect(minInput.value).toBe("10");
    expect(maxInput.value).toBe("80");
  });

  it("calls onChange with new tuple when min handle is dragged", () => {
    const onChange = vi.fn();
    render(
      <PriceRangeSlider
        min={0}
        max={100}
        value={[10, 80]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Мінімальна ціна"), {
      target: { value: "30" },
    });

    expect(onChange).toHaveBeenCalledWith([30, 80]);
  });

  it("clamps min to never exceed max (handles cannot cross)", () => {
    const onChange = vi.fn();
    render(
      <PriceRangeSlider
        min={0}
        max={100}
        value={[10, 50]}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Мінімальна ціна"), {
      target: { value: "90" },
    });

    expect(onChange).toHaveBeenCalledWith([50, 50]);
  });

  it("fires onCommit on mouse up with the final tuple", () => {
    const onCommit = vi.fn();
    render(
      <PriceRangeSlider
        min={0}
        max={100}
        value={[10, 80]}
        onChange={() => {}}
        onCommit={onCommit}
      />,
    );

    fireEvent.mouseUp(screen.getByLabelText("Максимальна ціна"));

    expect(onCommit).toHaveBeenCalledWith([10, 80]);
  });
});
