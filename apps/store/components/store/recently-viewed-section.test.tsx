import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CustomerProvider } from "@/lib/customer-context";
import { RecentlyViewedSection } from "./recently-viewed-section";

const sampleItem = {
  id: "p1",
  slug: "kurtka",
  name: "Куртка",
  quality: "first",
  imageUrl: null,
  priceEur: 200,
  priceUnit: "kg",
  viewedAt: Date.now(),
};

vi.mock("@/lib/recently-viewed", () => ({
  useRecentlyViewed: () => ({ items: [sampleItem], addItem: () => {} }),
}));

afterEach(() => cleanup());

describe("RecentlyViewedSection price gate", () => {
  it("does not render the EUR price when there is no customer", () => {
    const { container } = render(
      <CustomerProvider customer={null}>
        <RecentlyViewedSection />
      </CustomerProvider>,
    );
    const text = container.textContent ?? "";
    // priceEur lives in localStorage and survives logout — guests must
    // never see EUR amounts even if the saved row carries one.
    expect(text).not.toMatch(/€\s*200/);
  });

  it("renders the EUR price for an authenticated customer", () => {
    const { container } = render(
      <CustomerProvider customer={{ id: "c1", name: "Test" }}>
        <RecentlyViewedSection />
      </CustomerProvider>,
    );
    expect(container.textContent ?? "").toMatch(/€200/);
  });
});
