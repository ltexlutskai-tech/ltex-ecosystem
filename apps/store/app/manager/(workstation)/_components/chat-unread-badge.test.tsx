import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { ChatUnreadBadge } from "./chat-unread-badge";

afterEach(() => cleanup());

beforeEach(() => {
  vi.unstubAllGlobals();
});

function stub(total: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ total }),
    }),
  );
}

describe("ChatUnreadBadge", () => {
  it("renders nothing коли total=0", async () => {
    stub(0);
    const { container } = render(<ChatUnreadBadge />);
    await waitFor(() => {
      expect(container.querySelector("span")).toBeNull();
    });
  });

  it("renders badge з числом, '9+' коли більше 9", async () => {
    stub(15);
    const { container } = render(<ChatUnreadBadge />);
    await waitFor(() => {
      const badge = container.querySelector("span");
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe("9+");
    });
  });
});
