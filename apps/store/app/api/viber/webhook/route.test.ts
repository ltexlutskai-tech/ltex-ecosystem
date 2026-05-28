import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const VIBER_TOKEN = "test-viber-token";
process.env.VIBER_AUTH_TOKEN = VIBER_TOKEN;

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

function sign(body: string): string {
  return crypto.createHmac("sha256", VIBER_TOKEN).update(body).digest("hex");
}

function makeRequest(
  payload: unknown,
  opts: { sigOverride?: string } = {},
): NextRequest {
  const body = JSON.stringify(payload);
  const sig = opts.sigOverride ?? sign(body);
  return new NextRequest("http://localhost/api/viber/webhook", {
    method: "POST",
    headers: { "x-viber-content-signature": sig },
    body,
  });
}

const fetchMock = vi.fn(
  async (_url: unknown, _init?: unknown) =>
    new Response(JSON.stringify({ status: 0 }), { status: 200 }),
);

beforeEach(() => {
  vi.clearAllMocks();
  ingestMock.mockResolvedValue({ conversationId: "c1" });
  recordOutMock.mockResolvedValue(undefined);
  // Default: legacy completed conversation
  upsertConvMock.mockResolvedValue({
    id: "conv-1",
    clientId: "existing-client",
    registrationStep: "completed",
    pendingPhone: null,
    externalUserName: null,
  });
  handleRegistrationMock.mockResolvedValue({ kind: "noop" });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/viber/webhook — auth", () => {
  it("returns 403 when signature is invalid", async () => {
    const res = await POST(
      makeRequest(
        { event: "message", sender: { id: "u" }, message: { text: "hi" } },
        { sigOverride: "00".repeat(32) },
      ),
    );
    expect(res.status).toBe(403);
    expect(ingestMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/viber/webhook — conversation_started", () => {
  it("legacy completed (noop) → sends plain welcome", async () => {
    const res = await POST(
      makeRequest({
        event: "conversation_started",
        user: { id: "viber-1", name: "Olha" },
      }),
    );
    expect(res.status).toBe(200);
    expect(handleRegistrationMock).toHaveBeenCalled();
    const sendCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("send_message"),
    );
    expect(sendCalls).toHaveLength(1);
    const body = JSON.parse(
      (sendCalls[0]![1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body.receiver).toBe("viber-1");
    expect(String(body.text)).toContain("L-TEX");
    expect(recordOutMock).toHaveBeenCalledTimes(1);
  });

  it("new conversation (ask_phone outcome) → sends contact-keyboard", async () => {
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

    await POST(
      makeRequest({
        event: "conversation_started",
        user: { id: "viber-new", name: "X" },
      }),
    );
    const sendCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("send_message"),
    );
    expect(sendCalls).toHaveLength(1);
    const body = JSON.parse(
      (sendCalls[0]![1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body.keyboard).toMatchObject({
      Type: "keyboard",
      Buttons: [
        expect.objectContaining({
          ActionType: "share-phone",
          Text: expect.stringContaining("номером"),
        }),
      ],
    });
  });
});

describe("POST /api/viber/webhook — message events", () => {
  it("legacy completed: ingests free-form text", async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      if (String(url).includes("get_user_details")) {
        return new Response(
          JSON.stringify({ status: 0, user: { phone_number: "380501112233" } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ status: 0 }), { status: 200 });
    });

    const res = await POST(
      makeRequest({
        event: "message",
        sender: { id: "viber-2", name: "Petro" },
        message: { type: "text", text: "доброго дня" },
        message_token: 42,
      }),
    );
    expect(res.status).toBe(200);
    expect(handleRegistrationMock).toHaveBeenCalled();
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "viber",
        externalUserId: "viber-2",
        text: "доброго дня",
        phone: "380501112233",
        externalMessageId: "42",
      }),
    );
  });

  it("contact-share → handleRegistration with phone, NO ingest", async () => {
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
      greeting: "Раді вітати!",
    });

    await POST(
      makeRequest({
        event: "message",
        sender: { id: "viber-c", name: "X" },
        message: {
          type: "contact",
          contact: { phone_number: "+380671112233" },
        },
        message_token: 99,
      }),
    );
    expect(handleRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { type: "contact", phone: "+380671112233" },
      }),
    );
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("text 'region:volynska' → handleRegistration with region_select", async () => {
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

    await POST(
      makeRequest({
        event: "message",
        sender: { id: "viber-r", name: "X" },
        message: { type: "text", text: "region:volynska" },
        message_token: 100,
      }),
    );
    expect(handleRegistrationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: { type: "region_select", regionSlug: "volynska" },
      }),
    );
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("ignores picture/file message types", async () => {
    const res = await POST(
      makeRequest({
        event: "message",
        sender: { id: "viber-4", name: "X" },
        message: { type: "picture", media: "https://x" },
        message_token: 1,
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).not.toHaveBeenCalled();
    expect(handleRegistrationMock).not.toHaveBeenCalled();
  });

  it("returns 200 no-op for subscribed/delivered/seen", async () => {
    for (const ev of ["subscribed", "delivered", "seen", "unsubscribed"]) {
      ingestMock.mockClear();
      fetchMock.mockClear();
      handleRegistrationMock.mockClear();
      const res = await POST(makeRequest({ event: ev, user_id: "viber-5" }));
      expect(res.status).toBe(200);
      expect(ingestMock).not.toHaveBeenCalled();
      expect(handleRegistrationMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});
