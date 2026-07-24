import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  ClientConversationsPanel,
  type ClientConversationSummary,
} from "./client-conversations-panel";

// Тред робить polling-fetch — мокаємо, щоб тест був суто структурний.
vi.mock("../../../chat/_components/conversation-thread", () => ({
  ConversationThread: ({ conversationId }: { conversationId: string }) => (
    <div>thread:{conversationId}</div>
  ),
}));

afterEach(() => cleanup());

function conv(
  over: Partial<ClientConversationSummary> = {},
): ClientConversationSummary {
  return {
    id: "c1",
    platform: "telegram",
    externalUserName: null,
    phone: "+380501112233",
    unreadForManager: 0,
    lastMessageAt: "2026-07-24T10:00:00.000Z",
    lastMessagePreview: "привіт",
    ...over,
  };
}

describe("ClientConversationsPanel", () => {
  it("порожньо — показує підказку, без треду", () => {
    render(<ClientConversationsPanel conversations={[]} />);
    expect(screen.getByText(/Переписки з цим клієнтом ще немає/)).toBeDefined();
    expect(screen.queryByText(/^thread:/)).toBeNull();
  });

  it("одна розмова — тред без перемикача каналів", () => {
    render(<ClientConversationsPanel conversations={[conv({ id: "a" })]} />);
    expect(screen.getByText("thread:a")).toBeDefined();
    // Перемикача (кнопок каналів) немає при одній розмові.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("кілька розмов — перемикач каналів, обрано найсвіжішу", () => {
    render(
      <ClientConversationsPanel
        conversations={[
          conv({
            id: "tg",
            platform: "telegram",
            lastMessageAt: "2026-07-20T10:00:00.000Z",
          }),
          conv({
            id: "vb",
            platform: "viber",
            lastMessageAt: "2026-07-24T10:00:00.000Z",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Telegram")).toBeDefined();
    expect(screen.getByText("Viber")).toBeDefined();
    // Найсвіжіша (Viber) обрана за замовчуванням.
    expect(screen.getByText("thread:vb")).toBeDefined();
  });

  it("канал без відповіді (Instagram) — банер-попередження", () => {
    render(
      <ClientConversationsPanel
        conversations={[conv({ id: "ig", platform: "instagram" })]}
      />,
    );
    expect(
      screen.getByText(/Відповідь через Instagram ще не підключено/),
    ).toBeDefined();
  });

  it("робочий канал (Telegram) — без банера", () => {
    render(
      <ClientConversationsPanel
        conversations={[conv({ id: "tg", platform: "telegram" })]}
      />,
    );
    expect(screen.queryByText(/ще не підключено/)).toBeNull();
  });
});
