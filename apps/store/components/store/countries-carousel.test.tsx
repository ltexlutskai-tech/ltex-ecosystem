import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CountriesCarousel } from "./countries-carousel";

describe("CountriesCarousel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all 4 supplier countries", () => {
    render(<CountriesCarousel />);
    expect(screen.getByText("Англія")).toBeDefined();
    expect(screen.getByText("Німеччина")).toBeDefined();
    expect(screen.getByText("Канада")).toBeDefined();
    expect(screen.getByText("Польща")).toBeDefined();
  });

  it("renders the section title and subtitle", () => {
    render(<CountriesCarousel />);
    expect(screen.getByText(/Прямі постачання/i)).toBeDefined();
  });

  it("uses data-country attributes for each card", () => {
    const { container } = render(<CountriesCarousel />);
    const cards = container.querySelectorAll("[data-analytics='country-card']");
    expect(cards.length).toBe(4);
    const codes = Array.from(cards).map((c) => c.getAttribute("data-country"));
    expect(codes).toEqual(expect.arrayContaining(["GB", "DE", "CA", "PL"]));
  });
});
