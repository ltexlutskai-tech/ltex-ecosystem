import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CartProvider } from "@/lib/cart";
import { WishlistProvider } from "@/lib/wishlist";
import { LotCard, type LotCardLot } from "./lot-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/lots",
  useSearchParams: () => new URLSearchParams(),
}));

const baseLot: LotCardLot = {
  id: "lot-1",
  barcode: "2000153074116",
  weight: 15.3,
  quantity: 42,
  priceEur: 235.62,
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  status: "free",
  product: {
    id: "prod-1",
    slug: "odyag-zhinochyi-mix-lito-krem",
    name: "Одяг жіночий мікс літо Крем",
    priceUnit: "kg",
  },
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderWithCart(ui: React.ReactElement) {
  return render(
    <WishlistProvider>
      <CartProvider>{ui}</CartProvider>
    </WishlistProvider>,
  );
}

describe("LotCard", () => {
  it("renders barcode, name, weight, quantity in 'шт' for kg priceUnit", () => {
    renderWithCart(<LotCard lot={baseLot} rate={43} />);
    expect(screen.getByText("2000153074116")).toBeDefined();
    expect(screen.getByText(/Одяг жіночий мікс літо Крем/)).toBeDefined();
    expect(screen.getByText("15.3")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    // quantity unit = "шт" because priceUnit !== "pair"
    expect(screen.getByText("шт")).toBeDefined();
  });

  it("renders 'пар' unit when product.priceUnit is 'pair'", () => {
    renderWithCart(
      <LotCard
        lot={{ ...baseLot, product: { ...baseLot.product, priceUnit: "pair" } }}
        rate={43}
      />,
    );
    expect(screen.getByText("пар")).toBeDefined();
  });

  it("renders YouTube thumbnail when videoUrl present, with play button label", () => {
    renderWithCart(<LotCard lot={baseLot} rate={43} />);
    const playBtn = screen.getByLabelText(/Дивитись відеоогляд лоту/);
    expect(playBtn).toBeDefined();
    const thumb = screen.getByAltText(/Огляд лоту 2000153074116/);
    expect(thumb.getAttribute("src")).toContain("dQw4w9WgXcQ");
  });

  it("falls back to 'Огляд скоро' placeholder when videoUrl is null (no play button)", () => {
    renderWithCart(<LotCard lot={{ ...baseLot, videoUrl: null }} rate={43} />);
    expect(screen.getByText(/Огляд скоро/i)).toBeDefined();
    expect(screen.queryByLabelText(/Дивитись відеоогляд/)).toBeNull();
  });

  it("renders status badge 'Вільний' for free lots", () => {
    renderWithCart(<LotCard lot={baseLot} rate={43} />);
    expect(screen.getByText("Вільний")).toBeDefined();
  });

  it("renders 'Акція −X%' badge when on_sale + salePercent provided", () => {
    renderWithCart(
      <LotCard
        lot={{ ...baseLot, status: "on_sale" }}
        rate={43}
        salePercent={10}
      />,
    );
    expect(screen.getByText("Акція −10%")).toBeDefined();
  });

  it("formats price as UAH primary + EUR secondary", () => {
    renderWithCart(<LotCard lot={baseLot} rate={50} />);
    // 235.62 * 50 = 11781 UAH (rounded)
    const body = document.body.textContent ?? "";
    expect(body).toContain("11");
    expect(body).toMatch(/₴/);
    expect(screen.getByText(/€235\.62/)).toBeDefined();
  });

  it("toggles to 'У замовленні' state after clicking 'Додати'", () => {
    renderWithCart(<LotCard lot={baseLot} rate={43} />);
    const addBtn = screen.getByRole("button", {
      name: /Додати лот 2000153074116 до замовлення/,
    });
    fireEvent.click(addBtn);
    expect(screen.getByRole("button", { name: /Прибрати лот/ })).toBeDefined();
    expect(screen.getByText(/У замовленні/)).toBeDefined();
  });

  it("shows strike-through original EUR price for on_sale with salePercent", () => {
    renderWithCart(
      <LotCard
        lot={{ ...baseLot, status: "on_sale", priceEur: 90 }}
        rate={43}
        salePercent={10}
      />,
    );
    // 90 / (1 - 0.10) = 100
    expect(screen.getByText(/€100\.00/)).toBeDefined();
  });

  it("renders 'Детальніше' link to /lot/{barcode} on free lots", () => {
    renderWithCart(<LotCard lot={baseLot} rate={43} />);
    const link = screen.getByRole("link", {
      name: /Деталі лоту 2000153074116/,
    });
    expect(link.getAttribute("href")).toBe("/lot/2000153074116");
  });

  it("renders 'Детальніше' link even for sold lots, but hides 'Додати'", () => {
    renderWithCart(<LotCard lot={{ ...baseLot, status: "sold" }} rate={43} />);
    expect(
      screen.getByRole("link", { name: /Деталі лоту 2000153074116/ }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Додати лот/ })).toBeNull();
  });
});
