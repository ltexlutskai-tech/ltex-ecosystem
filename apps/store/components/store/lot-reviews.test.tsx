import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CartProvider } from "@/lib/cart";
import { LotReviews } from "./lot-reviews";

const baseLot = {
  barcode: "ABC123",
  weight: 25,
  quantity: 80,
  priceEur: 200,
  status: "free",
};

afterEach(() => cleanup());

function renderWithCart(ui: React.ReactElement) {
  return render(<CartProvider>{ui}</CartProvider>);
}

describe("LotReviews", () => {
  it("renders empty-state copy when there are no lots", () => {
    render(
      <LotReviews
        lots={[]}
        productId="prod-1"
        productName="Test product"
        rate={43}
      />,
    );
    expect(screen.getByText(/Лотів зараз немає/i)).toBeDefined();
  });

  it("renders YouTube thumbnail when videoUrl is present", () => {
    renderWithCart(
      <LotReviews
        lots={[
          {
            id: "lot-1",
            ...baseLot,
            videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        ]}
        productId="prod-1"
        productName="Test product"
        rate={43}
      />,
    );
    const thumb = screen.getByAltText(/Огляд лоту ABC123/);
    expect(thumb.getAttribute("src")).toContain("dQw4w9WgXcQ");
  });

  it("falls back to placeholder when videoUrl is null", () => {
    renderWithCart(
      <LotReviews
        lots={[{ id: "lot-1", ...baseLot, videoUrl: null }]}
        productId="prod-1"
        productName="Test product"
        rate={43}
      />,
    );
    expect(screen.getByText(/Огляд скоро/i)).toBeDefined();
  });

  it("formats price as UAH primary + EUR secondary", () => {
    renderWithCart(
      <LotReviews
        lots={[{ id: "lot-1", ...baseLot, videoUrl: null }]}
        productId="prod-1"
        productName="Test product"
        rate={50}
      />,
    );
    // Primary: 200 EUR * 50 = 10 000 UAH (uk-UA locale uses NBSP groups +
    // NBSP between number and currency symbol). Just check the digits and
    // hryvnia symbol are present in the body text.
    const body = document.body.textContent ?? "";
    expect(body).toContain("10");
    expect(body).toContain("000");
    expect(body).toMatch(/₴/);
    expect(screen.getByText(/€200\.00/)).toBeDefined();
  });
});
