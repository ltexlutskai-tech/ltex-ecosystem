import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LotsCategoryPills } from "./lots-category-pills";

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

describe("LotsCategoryPills", () => {
  it("renders pills with counts and 'Усі категорії' reset", () => {
    render(<LotsCategoryPills categories={CATEGORIES} />);
    expect(screen.getByText("Усі категорії")).toBeDefined();
    expect(screen.getByText("Одяг")).toBeDefined();
    expect(screen.getByText("(412)")).toBeDefined();
    expect(screen.getByText("(89)")).toBeDefined();
  });

  it("appends categoryId on pill click (multi-select)", () => {
    render(<LotsCategoryPills categories={CATEGORIES} />);
    fireEvent.click(screen.getByText("Одяг"));
    expect(pushMock.mock.calls[0]?.[0]).toContain("categoryId=cat-odyag");
  });

  it("removes pill from comma list on second click", () => {
    currentSearchParams = new URLSearchParams(
      "categoryId=cat-odyag,cat-vzuttia",
    );
    render(<LotsCategoryPills categories={CATEGORIES} />);
    fireEvent.click(screen.getByText("Одяг"));
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("categoryId=cat-vzuttia");
    expect(url).not.toContain("cat-odyag");
  });

  it("'Усі категорії' click clears categoryId", () => {
    currentSearchParams = new URLSearchParams("categoryId=cat-odyag");
    render(<LotsCategoryPills categories={CATEGORIES} />);
    fireEvent.click(screen.getByText("Усі категорії"));
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).not.toContain("categoryId");
  });

  it("renders nothing when categories empty", () => {
    const { container } = render(<LotsCategoryPills categories={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
