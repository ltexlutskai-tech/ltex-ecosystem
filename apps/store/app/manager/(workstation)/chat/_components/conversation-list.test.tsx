import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ConversationList } from "./conversation-list";
import type { ConversationListResponse } from "./types";

afterEach(() => cleanup());

function mockOnce(body: ConversationListResponse) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => body,
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("ConversationList", () => {
  it("renders empty-state коли немає розмов", async () => {
    mockOnce({ conversations: [], total: 0, page: 1, pageSize: 100 });
    render(
      <ConversationList selectedId={null} onSelect={() => {}} refreshKey={0} />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Розмов ще немає/i)).toBeDefined();
    });
  });

  it("renders conversation rows with client name + unread badge", async () => {
    mockOnce({
      conversations: [
        {
          id: "c1",
          platform: "telegram",
          externalUserId: "tg-1",
          externalUserName: null,
          phone: "+380501234567",
          clientId: "cl1",
          agentUserId: "u1",
          status: "active",
          unreadForManager: 3,
          lastMessageAt: new Date(Date.now() - 60_000).toISOString(),
          createdAt: new Date(Date.now() - 3_600_000).toISOString(),
          client: { id: "cl1", name: "ТОВ Ромашка" },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    render(
      <ConversationList selectedId={null} onSelect={() => {}} refreshKey={0} />,
    );
    await waitFor(() => {
      expect(screen.getByText("ТОВ Ромашка")).toBeDefined();
    });
    expect(screen.getByText("3")).toBeDefined();
  });
});
