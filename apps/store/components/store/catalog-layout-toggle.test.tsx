import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CatalogLayoutToggle } from "./catalog-layout-toggle";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/catalog",
  useSearchParams: () => new URLSearchParams("quality=ekstra&page=2"),
}));

afterEach(() => {
  pushMock.mockReset();
  cleanup();
});

describe("CatalogLayoutToggle", () => {
  it("removes ?layout (and ?page) when switching back to grid", () => {
    render(<CatalogLayoutToggle currentLayout="list" />);

    fireEvent.click(screen.getByLabelText("Сітка"));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("/catalog?quality=ekstra");
    expect(url).not.toContain("layout=");
    expect(url).not.toContain("page=");
  });

  it("sets ?layout=list (and clears ?page) when switching to list", () => {
    render(<CatalogLayoutToggle currentLayout="grid" />);

    fireEvent.click(screen.getByLabelText("Список"));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const url = pushMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("layout=list");
    expect(url).toContain("quality=ekstra");
    expect(url).not.toContain("page=");
  });
});
