import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const VIBER_TOKEN = "test-viber-token";
process.env.VIBER_AUTH_TOKEN = VIBER_TOKEN;

const { ingestMock, recordOutMock } = vi.hoisted(() => ({
  ingestMock: vi.fn(),
  recordOutMock: vi.fn(),
}));

vi.mock("@/lib/chat/inbound", () => ({
  ingestInboundMessage: (...args: unknown[]) => ingestMock(...args),
  recordOutboundSystemMessage: (...args: unknown[]) => recordOutMock(...args),
}));

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
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/viber/webhook", () => {
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

  it("sends welcome on conversation_started without ingest", async () => {
    const res = await POST(
      makeRequest({
        event: "conversation_started",
        user: { id: "viber-1", name: "Olha" },
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).not.toHaveBeenCalled();
    // fetch — це welcome (send_message); fetchViberUserPhone тут не запускається.
    const sendCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("send_message"),
    );
    expect(sendCalls).toHaveLength(1);
    const first = sendCalls[0];
    if (!first) throw new Error("expected send_message call");
    const body = JSON.parse((first[1] as { body: string }).body) as Record<
      string,
      unknown
    >;
    expect(body.receiver).toBe("viber-1");
    expect(String(body.text)).toContain("L-TEX");
    // Welcome також записаний у тред — для conversation_started це і є точка
    // створення розмови у /manager/chat.
    expect(recordOutMock).toHaveBeenCalledTimes(1);
    expect(recordOutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "viber",
        externalUserId: "viber-1",
        externalUserName: "Olha",
        text: expect.stringContaining("L-TEX"),
      }),
    );
  });

  it("ingests free-form text message", async () => {
    // fetchViberUserPhone викликається через fetch до get_user_details; стабимо успіх.
    fetchMock.mockImplementation(async (url: unknown, _init?: unknown) => {
      if (String(url).includes("get_user_details")) {
        return new Response(
          JSON.stringify({
            status: 0,
            user: { phone_number: "380501112233" },
          }),
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
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "viber",
        externalUserId: "viber-2",
        externalUserName: "Petro",
        text: "доброго дня",
        phone: "380501112233",
        externalMessageId: "42",
      }),
    );
  });

  it("ingests /start and also sends welcome + records welcome у треді", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: 0 }), { status: 200 }),
    );
    const res = await POST(
      makeRequest({
        event: "message",
        sender: { id: "viber-3", name: "Maria" },
        message: { type: "text", text: "/start" },
        message_token: 5,
      }),
    );
    expect(res.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "viber",
        externalUserId: "viber-3",
        text: "/start",
      }),
    );
    const startCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("send_message"),
    );
    expect(startCalls).toHaveLength(1);
    // Welcome також записаний у тред.
    expect(recordOutMock).toHaveBeenCalledTimes(1);
    expect(recordOutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "viber",
        externalUserId: "viber-3",
        externalUserName: "Maria",
        text: expect.stringContaining("L-TEX"),
      }),
    );
  });

  it("does NOT record welcome для звичайного тексту (тільки /start)", async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      if (String(url).includes("get_user_details")) {
        return new Response(JSON.stringify({ status: 0, user: {} }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ status: 0 }), { status: 200 });
    });
    await POST(
      makeRequest({
        event: "message",
        sender: { id: "viber-6", name: "Anna" },
        message: { type: "text", text: "ціни?" },
        message_token: 99,
      }),
    );
    expect(recordOutMock).not.toHaveBeenCalled();
  });

  it("ignores non-text message types (picture, file)", async () => {
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
  });

  it("returns 200 no-op for subscribed/delivered/seen", async () => {
    for (const ev of ["subscribed", "delivered", "seen", "unsubscribed"]) {
      ingestMock.mockClear();
      fetchMock.mockClear();
      const res = await POST(
        makeRequest({
          event: ev,
          user_id: "viber-5",
        }),
      );
      expect(res.status).toBe(200);
      expect(ingestMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});
