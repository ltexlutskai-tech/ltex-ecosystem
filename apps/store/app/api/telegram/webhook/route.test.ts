import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";

const { ingestMock, recordOutMock } = vi.hoisted(() => ({
  ingestMock: vi.fn(),
  recordOutMock: vi.fn(),
}));

vi.mock("@/lib/chat/inbound", () => ({
  ingestInboundMessage: (...args: unknown[]) => ingestMock(...args),
  recordOutboundSystemMessage: (...args: unknown[]) => recordOutMock(...args),
}));

import { POST } from "./route";

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {
    "x-telegram-bot-api-secret-token": "test-webhook-secret",
  },
): NextRequest {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const fetchMock = vi.fn(
  async (_url: unknown, _init?: unknown) => new Response("{}", { status: 200 }),
);

beforeEach(() => {
  vi.clearAllMocks();
  ingestMock.mockResolvedValue({ conversationId: "c1" });
  recordOutMock.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/telegram/webhook", () => {
  it("returns 401 on invalid secret", async () => {
    const res = await POST(
      makeRequest(
        { message: { chat: { id: 1 }, text: "hi" } },
        { "x-telegram-bot-api-secret-token": "wrong" },
      ),
    );
    expect(res.status).toBe(401);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("ingests free-form text and does NOT call Telegram API", async () => {
    const res = await POST(
      makeRequest({
        message: {
          chat: { id: 12345 },
          from: { first_name: "Ivan", last_name: "Petrenko" },
          message_id: 7,
          text: "Шукаю куртки",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "telegram",
        externalUserId: "12345",
        externalUserName: "Ivan Petrenko",
        text: "Шукаю куртки",
        externalMessageId: "7",
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ingests /start and sends a welcome reply", async () => {
    const res = await POST(
      makeRequest({
        message: {
          chat: { id: 999 },
          from: { username: "vasya" },
          message_id: 1,
          text: "/start",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "telegram",
        externalUserId: "999",
        externalUserName: "vasya",
        text: "/start",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("expected fetch call");
    const [url, init] = call;
    expect(String(url)).toContain("sendMessage");
    const sentBody = JSON.parse((init as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(sentBody.chat_id).toBe(999);
    expect(String(sentBody.text)).toContain("L-TEX");
    // Welcome також записаний у тред (out/system).
    expect(recordOutMock).toHaveBeenCalledTimes(1);
    expect(recordOutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "telegram",
        externalUserId: "999",
        externalUserName: "vasya",
        text: expect.stringContaining("L-TEX"),
      }),
    );
  });

  it("does NOT record welcome для звичайного тексту (тільки /start)", async () => {
    await POST(
      makeRequest({
        message: {
          chat: { id: 444 },
          from: { first_name: "Olya" },
          message_id: 11,
          text: "Шукаю куртки",
        },
      }),
    );
    expect(recordOutMock).not.toHaveBeenCalled();
  });

  it("ignores non-text payloads (sticker/photo)", async () => {
    const res = await POST(
      makeRequest({
        message: {
          chat: { id: 1 },
          sticker: { file_id: "x" },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ignores callback_query updates", async () => {
    const res = await POST(
      makeRequest({
        callback_query: {
          id: "cb1",
          data: "menu:search",
          message: { chat: { id: 1 } },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
