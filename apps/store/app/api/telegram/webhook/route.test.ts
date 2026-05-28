import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";

const { ingestMock, recordOutMock, upsertConvMock, handleRegistrationMock } =
  vi.hoisted(() => ({
    ingestMock: vi.fn(),
    recordOutMock: vi.fn(),
    upsertConvMock: vi.fn(),
    handleRegistrationMock: vi.fn(),
  }));

vi.mock("@/lib/chat/inbound", () => ({
  ingestInboundMessage: (...args: unknown[]) => ingestMock(...args),
  recordOutboundSystemMessage: (...args: unknown[]) => recordOutMock(...args),
  upsertConversation: (...args: unknown[]) => upsertConvMock(...args),
}));

vi.mock("@/lib/chat/registration", async () => {
  // Залишаємо реальні константи (UA_REGIONS used by webhook for keyboard).
  const actual = await vi.importActual<
    typeof import("@/lib/chat/registration")
  >("@/lib/chat/registration");
  return {
    ...actual,
    handleRegistrationStep: (...args: unknown[]) =>
      handleRegistrationMock(...args),
  };
});

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
  // Default: упсерт існуючої completed розмови (legacy-mode), щоб старі тести
  // продовжували йти у звичайний ingest без реєстрації.
  upsertConvMock.mockResolvedValue({
    id: "conv-1",
    clientId: "existing-client",
    registrationStep: "completed",
    pendingPhone: null,
    externalUserName: null,
  });
  // Default: handleRegistrationStep повертає noop (нічого не питаємо).
  handleRegistrationMock.mockResolvedValue({ kind: "noop" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/telegram/webhook — auth", () => {
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
});

describe("POST /api/telegram/webhook — legacy / completed (noop)", () => {
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
    expect(handleRegistrationMock).toHaveBeenCalled();
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

  it("legacy /start: ingest + welcome reply", async () => {
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
      expect.objectContaining({ text: "/start" }),
    );
    const sendCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("sendMessage"),
    );
    expect(sendCalls).toHaveLength(1);
    expect(recordOutMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT send welcome for regular text (only /start)", async () => {
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

  it("ignores non-text non-contact payloads (sticker)", async () => {
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
    expect(handleRegistrationMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/telegram/webhook — Phase 2 registration flow", () => {
  it("new conversation → ask_phone outcome → sends contact-keyboard, NO ingest", async () => {
    upsertConvMock.mockResolvedValueOnce({
      id: "conv-new",
      clientId: null,
      registrationStep: null,
      pendingPhone: null,
      externalUserName: null,
    });
    handleRegistrationMock.mockResolvedValueOnce({
      kind: "ask_phone",
      promptText: "ВВЕДІТЬ ТЕЛЕФОН",
    });

    const res = await POST(
      makeRequest({
        message: {
          chat: { id: 555 },
          from: { first_name: "X" },
          message_id: 1,
          text: "/start",
        },
      }),
    );
    expect(res.status).toBe(200);
    // Bot sent a sendMessage with contact-keyboard
    const send = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("sendMessage"),
    );
    expect(send).toBeDefined();
    const body = JSON.parse((send![1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.text).toContain("ТЕЛЕФОН");
    expect(body.reply_markup).toMatchObject({
      keyboard: [[{ text: expect.stringContaining("номером") }]],
    });
    // No ingest — user не написав менеджеру, лише запустив реєстрацію
    expect(ingestMock).not.toHaveBeenCalled();
    // Welcome логується у тред
    expect(recordOutMock).toHaveBeenCalledTimes(1);
  });

  it("contact-share → sends to handleRegistration with phone, NO ingest", async () => {
    upsertConvMock.mockResolvedValueOnce({
      id: "conv-c",
      clientId: null,
      registrationStep: "awaiting_phone",
      pendingPhone: null,
      externalUserName: null,
    });
    handleRegistrationMock.mockResolvedValueOnce({
      kind: "linked",
      managerName: "Іванов",
      greeting: "Раді вітати знову!",
    });

    await POST(
      makeRequest({
        message: {
          chat: { id: 777 },
          from: { first_name: "X" },
          message_id: 5,
          contact: { phone_number: "+380501112233" },
        },
      }),
    );
    expect(handleRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { type: "contact", phone: "+380501112233" },
      }),
    );
    expect(ingestMock).not.toHaveBeenCalled();
    // Welcome-back sent + remove_keyboard
    const send = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("sendMessage"),
    );
    expect(send).toBeDefined();
    const body = JSON.parse((send![1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.reply_markup).toMatchObject({ remove_keyboard: true });
  });

  it("callback_query region:<slug> → handleRegistrationStep with region_select", async () => {
    upsertConvMock.mockResolvedValueOnce({
      id: "conv-r",
      clientId: null,
      registrationStep: "awaiting_region",
      pendingPhone: "+380501112233",
      externalUserName: "X",
    });
    handleRegistrationMock.mockResolvedValueOnce({
      kind: "registered",
      managerName: "Олена",
      greeting: "Дякуємо",
    });

    const res = await POST(
      makeRequest({
        callback_query: {
          id: "cb1",
          data: "region:volynska",
          from: { first_name: "X" },
          message: { chat: { id: 888 } },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(handleRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { type: "region_select", regionSlug: "volynska" },
      }),
    );
    // answerCallbackQuery + sendMessage
    const sentTexts = fetchMock.mock.calls.map(([url]) => String(url));
    expect(sentTexts.some((u) => u.includes("answerCallbackQuery"))).toBe(true);
    expect(sentTexts.some((u) => u.includes("sendMessage"))).toBe(true);
  });

  it("ignores callback_query with non-region data", async () => {
    const res = await POST(
      makeRequest({
        callback_query: {
          id: "cb2",
          data: "menu:search",
          from: { first_name: "X" },
          message: { chat: { id: 1 } },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(handleRegistrationMock).not.toHaveBeenCalled();
    expect(ingestMock).not.toHaveBeenCalled();
    // лише answerCallbackQuery (не sendMessage)
    const sendCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("sendMessage"),
    );
    expect(sendCalls).toHaveLength(0);
  });
});
