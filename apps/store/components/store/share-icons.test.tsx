import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ShareIcons } from "./share-icons";

const TEST_URL = "https://example.com/product/test-slug";
const TEST_TITLE = "Тестовий товар";

describe("ShareIcons", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all five share targets with accessible labels", () => {
    render(<ShareIcons url={TEST_URL} title={TEST_TITLE} />);

    expect(screen.getByTestId("share-copy-link")).toBeDefined();
    expect(screen.getByLabelText(/Telegram/)).toBeDefined();
    expect(screen.getByLabelText(/Viber/)).toBeDefined();
    expect(screen.getByLabelText(/Facebook/)).toBeDefined();
    expect(screen.getByLabelText(/WhatsApp/)).toBeDefined();
  });

  it("builds correct share hrefs with encoded url", () => {
    render(<ShareIcons url={TEST_URL} title={TEST_TITLE} />);

    const telegramLink = screen.getByLabelText(/Telegram/) as HTMLAnchorElement;
    const facebookLink = screen.getByLabelText(/Facebook/) as HTMLAnchorElement;
    const whatsappLink = screen.getByLabelText(/WhatsApp/) as HTMLAnchorElement;

    expect(telegramLink.href).toContain("t.me/share/url");
    expect(telegramLink.href).toContain(encodeURIComponent(TEST_URL));
    expect(facebookLink.href).toContain("facebook.com/sharer");
    expect(facebookLink.href).toContain(encodeURIComponent(TEST_URL));
    expect(whatsappLink.href).toContain("wa.me");
    expect(whatsappLink.href).toContain(encodeURIComponent(TEST_URL));
  });

  it("builds viber:// href with encoded title and url", () => {
    render(<ShareIcons url={TEST_URL} title={TEST_TITLE} />);
    const viberLink = screen.getByLabelText(/Viber/) as HTMLAnchorElement;
    expect(viberLink.getAttribute("href")).toContain("viber://forward");
    expect(viberLink.getAttribute("href")).toContain(
      encodeURIComponent(TEST_TITLE),
    );
  });

  it("copies url to clipboard and shows copied feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ShareIcons url={TEST_URL} title={TEST_TITLE} />);

    const btn = screen.getByTestId("share-copy-link");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(TEST_URL);
    });

    // After copy, the title attribute swaps to the "copied" toast string.
    await waitFor(() => {
      expect(btn.getAttribute("title")).toMatch(/скопійовано/i);
    });
  });
});
