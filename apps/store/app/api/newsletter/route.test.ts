import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    newsletterSubscriber: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 5 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/notifications", () => ({
  notifyNewsletterSubscribe: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email", () => ({
  sendWelcomeNewsletterEmail: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";
import { newsletterSubscribeSchema } from "@/lib/newsletter-schema";
import { prisma } from "@ltex/db";
import { rateLimit } from "@/lib/rate-limit";
import { notifyNewsletterSubscribe } from "@/lib/notifications";
import { sendWelcomeNewsletterEmail } from "@/lib/email";

const mockPrisma = prisma as unknown as {
  newsletterSubscriber: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;
const mockNotify = notifyNewsletterSubscribe as ReturnType<typeof vi.fn>;
const mockWelcome = sendWelcomeNewsletterEmail as ReturnType<typeof vi.fn>;

async function flushPromises(): Promise<void> {
  // Allow the void-fired notification chains to settle so assertions on the
  // mocks are deterministic.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("Newsletter API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 5 });
  });

  describe("schema", () => {
    it("accepts valid email", () => {
      const result = newsletterSubscribeSchema.safeParse({
        email: "user@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = newsletterSubscribeSchema.safeParse({
        email: "not-an-email",
      });
      expect(result.success).toBe(false);
    });
  });

  it("creates a new subscriber and returns 201", async () => {
    mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue(null);
    mockPrisma.newsletterSubscriber.create.mockResolvedValue({
      email: "new@example.com",
      source: "footer",
      subscribedAt: new Date("2026-04-25T12:00:00Z"),
    });

    const res = await POST(buildRequest({ email: "new@example.com" }) as never);
    expect(res.status).toBe(201);
    expect(mockPrisma.newsletterSubscriber.create).toHaveBeenCalledWith({
      data: { email: "new@example.com", source: "footer" },
    });
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 200 with alreadySubscribed when email exists and is active", async () => {
    mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue({
      email: "old@example.com",
      unsubscribedAt: null,
    });

    const res = await POST(buildRequest({ email: "OLD@example.com" }) as never);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { alreadySubscribed: boolean };
    expect(json.alreadySubscribed).toBe(true);
    expect(mockPrisma.newsletterSubscriber.create).not.toHaveBeenCalled();
    expect(mockPrisma.newsletterSubscriber.update).not.toHaveBeenCalled();
    await flushPromises();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockWelcome).not.toHaveBeenCalled();
  });

  it("re-subscribes a previously unsubscribed email", async () => {
    mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue({
      email: "back@example.com",
      unsubscribedAt: new Date("2025-01-01"),
    });
    mockPrisma.newsletterSubscriber.update.mockResolvedValue({
      email: "back@example.com",
      source: "footer",
      subscribedAt: new Date("2026-04-25T12:00:00Z"),
      unsubscribedAt: null,
    });

    const res = await POST(
      buildRequest({ email: "back@example.com" }) as never,
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.newsletterSubscriber.update).toHaveBeenCalled();
  });

  it("rejects invalid email with 400", async () => {
    const res = await POST(buildRequest({ email: "bad" }) as never);
    expect(res.status).toBe(400);
    expect(mockPrisma.newsletterSubscriber.findUnique).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited", async () => {
    mockRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(
      buildRequest({ email: "user@example.com" }) as never,
    );
    expect(res.status).toBe(429);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new Request("http://localhost/api/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  describe("notifications", () => {
    it("fires Telegram + welcome email exactly once on new subscribe", async () => {
      mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue(null);
      mockPrisma.newsletterSubscriber.create.mockResolvedValue({
        email: "new@example.com",
        source: "footer",
        subscribedAt: new Date("2026-04-25T12:00:00Z"),
      });

      const res = await POST(
        buildRequest({ email: "new@example.com" }) as never,
      );
      expect(res.status).toBe(201);
      await flushPromises();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotify).toHaveBeenCalledWith({
        email: "new@example.com",
        source: "footer",
        subscribedAt: new Date("2026-04-25T12:00:00Z"),
      });
      expect(mockWelcome).toHaveBeenCalledTimes(1);
      expect(mockWelcome).toHaveBeenCalledWith("new@example.com");
    });

    it("fires notifications on re-subscribe of previously unsubscribed email", async () => {
      mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue({
        email: "back@example.com",
        unsubscribedAt: new Date("2025-01-01"),
      });
      mockPrisma.newsletterSubscriber.update.mockResolvedValue({
        email: "back@example.com",
        source: "footer",
        subscribedAt: new Date("2026-04-25T12:00:00Z"),
        unsubscribedAt: null,
      });

      await POST(buildRequest({ email: "back@example.com" }) as never);
      await flushPromises();
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockWelcome).toHaveBeenCalledTimes(1);
    });

    it("still returns 201 when notifyNewsletterSubscribe rejects", async () => {
      mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue(null);
      mockPrisma.newsletterSubscriber.create.mockResolvedValue({
        email: "fail@example.com",
        source: "footer",
        subscribedAt: new Date("2026-04-25T12:00:00Z"),
      });
      mockNotify.mockRejectedValueOnce(new Error("telegram down"));

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(
        buildRequest({ email: "fail@example.com" }) as never,
      );
      expect(res.status).toBe(201);
      await flushPromises();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("still returns 201 when sendWelcomeNewsletterEmail rejects", async () => {
      mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue(null);
      mockPrisma.newsletterSubscriber.create.mockResolvedValue({
        email: "noemail@example.com",
        source: "footer",
        subscribedAt: new Date("2026-04-25T12:00:00Z"),
      });
      mockWelcome.mockRejectedValueOnce(new Error("smtp down"));

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await POST(
        buildRequest({ email: "noemail@example.com" }) as never,
      );
      expect(res.status).toBe(201);
      await flushPromises();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
