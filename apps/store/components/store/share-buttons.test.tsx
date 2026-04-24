import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ShareButtons } from "./share-buttons";

const TEST_URL = "https://example.com/product/test-slug";
const TEST_TITLE = "Тестовий товар";

describe("ShareButtons", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all four share targets with accessible labels", () => {
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);

    expect(screen.getByTestId("share-copy-link")).toBeDefined();
    expect(screen.getByLabelText(/Viber/)).toBeDefined();
    expect(screen.getByLabelText(/Telegram/)).toBeDefined();
    expect(screen.getByLabelText(/Facebook/)).toBeDefined();
  });

  it("builds correct share hrefs for Telegram and Facebook with encoded url", () => {
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);

    const telegramLink = screen.getByLabelText(/Telegram/) as HTMLAnchorElement;
    const facebookLink = screen.getByLabelText(/Facebook/) as HTMLAnchorElement;

    expect(telegramLink.href).toContain("t.me/share/url");
    expect(telegramLink.href).toContain(encodeURIComponent(TEST_URL));
    expect(facebookLink.href).toContain("facebook.com/sharer");
    expect(facebookLink.href).toContain(encodeURIComponent(TEST_URL));
  });

  it("builds viber:// href with title and url", () => {
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);
    const viberLink = screen.getByLabelText(/Viber/) as HTMLAnchorElement;
    expect(viberLink.getAttribute("href")).toContain("viber://forward");
    expect(viberLink.getAttribute("href")).toContain(
      encodeURIComponent(TEST_TITLE),
    );
  });

  it("copies url to clipboard and shows copied feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);

    const btn = screen.getByTestId("share-copy-link");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(TEST_URL);
    });

    // After copy, the check icon replaces the link icon.
    await waitFor(() => {
      expect(screen.getByText(/Посилання скопійовано/)).toBeDefined();
    });
  });
});
