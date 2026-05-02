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

describe("LotsFiltersForm", () => {
  it("appends status=free when 'Вільні' checkbox toggled on", () => {
    render(<LotsFiltersForm />);
    const cb = screen.getByLabelText("Вільні");
    fireEvent.click(cb);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[0]).toContain("status=free");
  });

  it("supports multi-status (free + on_sale + reserved)", () => {
    currentSearchParams = new URLSearchParams("status=free");
    render(<LotsFiltersForm />);
    const cb = screen.getByLabelText("Акції");
    fireEvent.click(cb);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("status=free%2Con_sale");
  });

  it("removes single status from comma list when toggled off", () => {
    currentSearchParams = new URLSearchParams("status=free,on_sale");
    render(<LotsFiltersForm />);
    const cb = screen.getByLabelText("Вільні");
    fireEvent.click(cb);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("status=on_sale");
    expect(url).not.toContain("status=free");
  });

  it("encodes isNew=true when 'Новинки' checkbox toggled on", () => {
    render(<LotsFiltersForm />);
    const cb = screen.getByLabelText(/Новинки/);
    fireEvent.click(cb);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[0]).toContain("isNew=true");
  });

  // Categories moved out of the sidebar form into the top pills bar
  // (LotsCategoryPills) — see lots-category-pills.test.tsx.
  it.skip("appends categoryId on toggle (multi-select via comma list)", () => {
    render(<LotsFiltersForm />);
    const cb = screen.getByLabelText(/Одяг/);
    fireEvent.click(cb);
    expect(pushMock.mock.calls[0]?.[0]).toContain("categoryId=cat-odyag");
  });

  it.skip("removes single value from comma-separated list when toggled off", () => {
    currentSearchParams = new URLSearchParams(
      "categoryId=cat-odyag,cat-vzuttia",
    );
    render(<LotsFiltersForm />);
    const cb = screen.getByLabelText(/Одяг/);
    fireEvent.click(cb);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("categoryId=cat-vzuttia");
    expect(url).not.toContain("cat-odyag");
  });

  it("commits weight + price ranges via 'Застосувати' button", () => {
    render(<LotsFiltersForm />);
    const wMin = screen.getByLabelText("Вага лота від") as HTMLInputElement;
    const pMax = screen.getByLabelText("Ціна до") as HTMLInputElement;
    fireEvent.change(wMin, { target: { value: "10" } });
    fireEvent.change(pMax, { target: { value: "200" } });
    expect(pushMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Застосувати ціну та вагу"));
    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("weightMin=10");
    expect(url).toContain("priceMax=200");
  });

  it("clears all filters via 'Скинути'", () => {
    currentSearchParams = new URLSearchParams("status=free&isNew=true");
    render(<LotsFiltersForm />);
    const reset = screen.getByText("Скинути");
    fireEvent.click(reset);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0]?.[0]).toBe("/lots");
  });

  // Categories moved out of the sidebar form into the top pills bar
  // (LotsCategoryPills) — see lots-category-pills.tsx.

  it("does not render the removed 'Тільки з відеооглядом' filter", () => {
    render(<LotsFiltersForm />);
    expect(screen.queryByLabelText(/Тільки з відеооглядом/)).toBeNull();
  });
});
