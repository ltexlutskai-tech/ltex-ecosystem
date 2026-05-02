import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LotsFiltersForm } from "./lots-filters-form";

const pushMock = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/lots",
  useSearchParams: () => currentSearchParams,
}));

afterEach(() => {
  pushMock.mockReset();
  currentSearchParams = new URLSearchParams();
  cleanup();
});

const CATEGORIES = [
  { id: "cat-odyag", name: "Одяг", count: 412 },
  { id: "cat-vzuttia", name: "Взуття", count: 89 },
];

describe("LotsFiltersForm", () => {
  it("encodes hasVideo=true into URL when checkbox toggled on", () => {
    render(<LotsFiltersForm categories={CATEGORIES} />);
    const cb = screen.getByLabelText(/Тільки з відеооглядом/);
    fireEvent.click(cb);
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("hasVideo=true");
    expect(url).not.toContain("page=");
  });

  it("encodes status=free when 'Вільні' radio selected", () => {
    render(<LotsFiltersForm categories={CATEGORIES} />);
    const radio = screen.getByLabelText("Вільні");
    fireEvent.click(radio);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[0]).toContain("status=free");
  });

  it("removes status param when 'Доступні' radio selected", () => {
    currentSearchParams = new URLSearchParams("status=free");
    render(<LotsFiltersForm categories={CATEGORIES} />);
    const radio = screen.getByLabelText("Доступні");
    fireEvent.click(radio);
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).not.toContain("status=");
  });

  it("appends categoryId on toggle (multi-select via comma list)", () => {
    render(<LotsFiltersForm categories={CATEGORIES} />);
    const cb = screen.getByLabelText(/Одяг/);
    fireEvent.click(cb);
    expect(pushMock.mock.calls[0]?.[0]).toContain("categoryId=cat-odyag");
  });

  it("removes single value from comma-separated list when toggled off", () => {
    currentSearchParams = new URLSearchParams(
      "categoryId=cat-odyag,cat-vzuttia",
    );
    render(<LotsFiltersForm categories={CATEGORIES} />);
    const cb = screen.getByLabelText(/Одяг/);
    fireEvent.click(cb);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("categoryId=cat-vzuttia");
    expect(url).not.toContain("cat-odyag");
  });

  it("commits weight range on blur", () => {
    render(<LotsFiltersForm categories={CATEGORIES} />);
    const input = screen.getByLabelText("Вага лота від") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.blur(input);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[0]).toContain("weightMin=10");
  });

  it("clears all filters via 'Скинути'", () => {
    currentSearchParams = new URLSearchParams("status=free&hasVideo=true");
    render(<LotsFiltersForm categories={CATEGORIES} />);
    const reset = screen.getByText("Скинути");
    fireEvent.click(reset);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[0]).toBe("/lots");
  });

  it("renders category counts next to names", () => {
    render(<LotsFiltersForm categories={CATEGORIES} />);
    expect(screen.getByText("(412)")).toBeDefined();
    expect(screen.getByText("(89)")).toBeDefined();
  });
});
