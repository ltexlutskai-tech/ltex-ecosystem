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

import { POST, newsletterSubscribeSchema } from "./route";
import { prisma } from "@ltex/db";
import { rateLimit } from "@/lib/rate-limit";

const mockPrisma = prisma as unknown as {
  newsletterSubscriber: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};
const mockRateLimit = rateLimit as ReturnType<typeof vi.fn>;

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
    mockPrisma.newsletterSubscriber.create.mockResolvedValue({});

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
  });

  it("re-subscribes a previously unsubscribed email", async () => {
    mockPrisma.newsletterSubscriber.findUnique.mockResolvedValue({
      email: "back@example.com",
      unsubscribedAt: new Date("2025-01-01"),
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
});
