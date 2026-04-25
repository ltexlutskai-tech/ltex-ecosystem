import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import {
  CategoriesCarousel,
  type CategoryCarouselItem,
} from "./categories-carousel";

const CATEGORIES: CategoryCarouselItem[] = [
  { id: "1", slug: "odyag", name: "Одяг", productCount: 250 },
  { id: "2", slug: "vzuttia", name: "Взуття", productCount: 91 },
  { id: "3", slug: "aksesuary", name: "Аксесуари", productCount: 45 },
  { id: "4", slug: "igrashky", name: "Іграшки", productCount: 1 },
];

describe("CategoriesCarousel", () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders all categories with correct slugs and pluralized counts", () => {
    render(<CategoriesCarousel categories={CATEGORIES} />);

    const odyag = screen.getByTestId(
      "category-card-odyag",
    ) as HTMLAnchorElement;
    expect(odyag.getAttribute("href")).toBe("/catalog/odyag");
    expect(screen.getByText("Одяг")).toBeDefined();
    expect(screen.getByText("250 товарів")).toBeDefined();
    expect(screen.getByText("91 товар")).toBeDefined();
    expect(screen.getByText("45 товарів")).toBeDefined();
    expect(screen.getByText("1 товар")).toBeDefined();
  });

  it("renders one dot per category and marks first as selected initially", () => {
    render(<CategoriesCarousel categories={CATEGORIES} />);
    const dot0 = screen.getByTestId("category-dot-0");
    const dot1 = screen.getByTestId("category-dot-1");
    expect(dot0.getAttribute("aria-selected")).toBe("true");
    expect(dot1.getAttribute("aria-selected")).toBe("false");
  });

  it("advances currentIndex when next arrow is clicked", () => {
    render(<CategoriesCarousel categories={CATEGORIES} />);
    fireEvent.click(screen.getByTestId("category-carousel-next"));
    expect(
      screen.getByTestId("category-dot-1").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("wraps to last when prev arrow clicked from first", () => {
    render(<CategoriesCarousel categories={CATEGORIES} />);
    fireEvent.click(screen.getByTestId("category-carousel-prev"));
    expect(
      screen.getByTestId("category-dot-3").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("jumps to specific slide when a dot is clicked", () => {
    render(<CategoriesCarousel categories={CATEGORIES} />);
    fireEvent.click(screen.getByTestId("category-dot-2"));
    expect(
      screen.getByTestId("category-dot-2").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("auto-rotates after 6 seconds", () => {
    vi.useFakeTimers();
    render(<CategoriesCarousel categories={CATEGORIES} />);

    expect(
      screen.getByTestId("category-dot-0").getAttribute("aria-selected"),
    ).toBe("true");

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(
      screen.getByTestId("category-dot-1").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("returns null for empty categories array", () => {
    const { container } = render(<CategoriesCarousel categories={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
