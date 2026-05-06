import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    emailJob: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@ltex/db";
import {
  enqueueEmail,
  isTransientError,
  maskEmail,
  maskPii,
  nextAttemptDelayMs,
  processEmailQueue,
  sendWithRetry,
} from "./email";

const mockPrisma = prisma as unknown as {
  emailJob: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

describe("maskEmail", () => {
  it("preserves first two chars of local part and full domain", () => {
    expect(maskEmail("alice@example.com")).toBe("al***@example.com");
  });

  it("returns '(unknown)' for undefined input", () => {
    expect(maskEmail(undefined)).toBe("(unknown)");
  });

  it("returns '(invalid)' when there is no @", () => {
    expect(maskEmail("not-an-email")).toBe("(invalid)");
  });

  it("returns '(invalid)' when @ is the first char", () => {
    expect(maskEmail("@example.com")).toBe("(invalid)");
  });

  it("handles short local part without crashing", () => {
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });
});

describe("maskPii", () => {
  it("masks email substrings inside an arbitrary string", () => {
    expect(maskPii("Failed to deliver to alice@example.com — 4xx")).toBe(
      "Failed to deliver to al***@example.com — 4xx",
    );
  });

  it("masks Ukrainian phone numbers (preserves prefix + last 2 digits)", () => {
    expect(maskPii("delivery for +380676710515 failed")).toContain("380***15");
    expect(maskPii("delivery for +380676710515 failed")).not.toContain(
      "380676710515",
    );
  });

  it("does not mask short digit sequences (e.g. status codes)", () => {
    expect(maskPii("Resend 503: Service Unavailable")).toBe(
      "Resend 503: Service Unavailable",
    );
  });

  it("passes through plain error text untouched", () => {
    expect(maskPii("ECONNRESET: connection reset by peer")).toBe(
      "ECONNRESET: connection reset by peer",
    );
  });
});

describe("isTransientError", () => {
  it("classifies AbortError as transient (timeout)", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isTransientError(err)).toBe(true);
  });

  it("classifies ETIMEDOUT code as transient", () => {
    const err = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    expect(isTransientError(err)).toBe(true);
  });

  it("classifies ECONNRESET code as transient", () => {
    const err = Object.assign(new Error("reset"), { code: "ECONNRESET" });
    expect(isTransientError(err)).toBe(true);
  });

  it("classifies ECONNREFUSED code as transient", () => {
    const err = Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
    expect(isTransientError(err)).toBe(true);
  });

  it("classifies network in message as transient", () => {
    expect(isTransientError(new Error("Network request failed"))).toBe(true);
  });

  it("classifies 5xx in message as transient", () => {
    expect(isTransientError(new Error("Resend 503: Service Unavailable"))).toBe(
      true,
    );
    expect(isTransientError(new Error("Upstream 500"))).toBe(true);
  });

  it("does NOT classify 4xx as transient", () => {
    expect(isTransientError(new Error("Resend 401: Unauthorized"))).toBe(false);
    expect(isTransientError(new Error("422 Unprocessable Entity"))).toBe(false);
    expect(isTransientError(new Error("404"))).toBe(false);
  });

  it("does NOT classify validation errors as transient", () => {
    expect(isTransientError(new Error("Invalid recipient address"))).toBe(
      false,
    );
  });

  it("returns false for non-Error values", () => {
    expect(isTransientError("string error")).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});

describe("sendWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const payload = {
    to: "alice@example.com",
    subject: "Test",
    html: "<p>hi</p>",
  };

  it("returns immediately on first-attempt success", async () => {
    const send = vi.fn(async () => {});
    await sendWithRetry(send, payload);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries up to 3 times on transient errors then logs and rethrows", async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
    });

    const promise = sendWithRetry(send, payload).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(6000);
    const result = await promise;

    expect(send).toHaveBeenCalledTimes(3);
    expect(result).toBeInstanceOf(Error);
    expect(console.error).toHaveBeenCalledWith(
      "[L-TEX] Email send failed after retries",
      expect.objectContaining({
        to: "al***@example.com",
        subject: "Test",
        attempts: 3,
      }),
    );
  });

  it("does NOT retry on 4xx (non-transient) errors", async () => {
    const send = vi.fn(async () => {
      throw new Error("Resend 401: Unauthorized");
    });

    await expect(sendWithRetry(send, payload)).rejects.toThrow(/Resend 401/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("succeeds on second attempt after one transient failure", async () => {
    let calls = 0;
    const send = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error("connection reset"), {
          code: "ECONNRESET",
        });
      }
    });

    const promise = sendWithRetry(send, payload);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(send).toHaveBeenCalledTimes(2);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("masks recipient email in exhaustion log", async () => {
    const send = vi.fn(async () => {
      throw new Error("network down");
    });

    const promise = sendWithRetry(
      send,
      { ...payload, to: "verylonglocal@mail.example" },
      2,
    ).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(console.error).toHaveBeenCalledWith(
      "[L-TEX] Email send failed after retries",
      expect.objectContaining({ to: "ve***@mail.example" }),
    );
  });
});

describe("nextAttemptDelayMs", () => {
  it("returns 1m for first retry", () => {
    expect(nextAttemptDelayMs(1)).toBe(1 * 60 * 1000);
  });

  it("returns escalating backoff per attempt", () => {
    expect(nextAttemptDelayMs(2)).toBe(5 * 60 * 1000);
    expect(nextAttemptDelayMs(3)).toBe(30 * 60 * 1000);
    expect(nextAttemptDelayMs(4)).toBe(120 * 60 * 1000);
    expect(nextAttemptDelayMs(5)).toBe(360 * 60 * 1000);
    expect(nextAttemptDelayMs(6)).toBe(720 * 60 * 1000);
  });

  it("clamps to the last bucket past the table length", () => {
    expect(nextAttemptDelayMs(99)).toBe(720 * 60 * 1000);
  });

  it("clamps zero/negative attempts to the first bucket", () => {
    expect(nextAttemptDelayMs(0)).toBe(1 * 60 * 1000);
    expect(nextAttemptDelayMs(-5)).toBe(1 * 60 * 1000);
  });
});

describe("enqueueEmail", () => {
  const ORIGINAL_RESEND = process.env.RESEND_API_KEY;
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "test_key";
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = ORIGINAL_RESEND;
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("creates an EmailJob row with pending defaults", async () => {
    mockPrisma.emailJob.create.mockResolvedValue({ id: "ej1" });

    await enqueueEmail({
      to: "alice@example.com",
      subject: "Hi",
      html: "<p>body</p>",
      source: "order",
      referenceId: "order-123",
    });

    expect(mockPrisma.emailJob.create).toHaveBeenCalledWith({
      data: {
        to: "alice@example.com",
        subject: "Hi",
        htmlBody: "<p>body</p>",
        textBody: null,
        source: "order",
        referenceId: "order-123",
      },
    });
  });

  it("persists referenceId=null when omitted", async () => {
    mockPrisma.emailJob.create.mockResolvedValue({ id: "ej2" });

    await enqueueEmail({
      to: "bob@example.com",
      subject: "Newsletter",
      html: "<p>welcome</p>",
      source: "newsletter",
    });

    expect(mockPrisma.emailJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referenceId: null }),
      }),
    );
  });

  it("never throws when prisma.create rejects (request path stays unblocked)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.emailJob.create.mockRejectedValue(new Error("DB down"));

    await expect(
      enqueueEmail({
        to: "alice@example.com",
        subject: "Hi",
        html: "<p>body</p>",
        source: "order",
      }),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      "[L-TEX] enqueueEmail failed",
      expect.objectContaining({ to: "al***@example.com", source: "order" }),
    );
  });

  it("skips persistence when no transport is configured outside production", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    process.env.NODE_ENV = "development";
    vi.spyOn(console, "info").mockImplementation(() => {});

    await enqueueEmail({
      to: "alice@example.com",
      subject: "Hi",
      html: "<p>body</p>",
      source: "order",
    });

    expect(mockPrisma.emailJob.create).not.toHaveBeenCalled();
  });
});

describe("processEmailQueue", () => {
  const ORIGINAL_RESEND = process.env.RESEND_API_KEY;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.RESEND_API_KEY = "test_key";
    delete process.env.SMTP_HOST;

    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = ORIGINAL_RESEND;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeJob(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "job1",
      to: "alice@example.com",
      subject: "Order #abc",
      htmlBody: "<p>thanks</p>",
      textBody: null,
      source: "order",
      referenceId: "order-1",
      status: "pending",
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: new Date(),
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      sentAt: null,
      ...overrides,
    };
  }

  it("marks pending job as sent after successful Resend call", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: "msg" }), { status: 200 }),
    );
    mockPrisma.emailJob.findMany.mockResolvedValue([makeJob()]);
    mockPrisma.emailJob.update.mockResolvedValue({});

    const result = await processEmailQueue();

    expect(result).toEqual({
      processed: 1,
      sent: 1,
      failed: 0,
      retrying: 0,
    });
    expect(mockPrisma.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1" },
        data: expect.objectContaining({
          status: "sent",
          attempts: 1,
          lastError: null,
        }),
      }),
    );
  });

  it("transitions to retrying on transient failure with backoff applied", async () => {
    fetchSpy.mockResolvedValue(
      new Response("upstream down", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    mockPrisma.emailJob.findMany.mockResolvedValue([
      makeJob({ attempts: 0, maxAttempts: 5 }),
    ]);
    mockPrisma.emailJob.update.mockResolvedValue({});

    const before = Date.now();
    const result = await processEmailQueue();

    expect(result.retrying).toBe(1);
    expect(result.failed).toBe(0);

    const updateCall = mockPrisma.emailJob.update.mock.calls[0]?.[0] as {
      data: {
        status: string;
        attempts: number;
        nextAttemptAt: Date;
        lastError: string;
      };
    };
    expect(updateCall.data.status).toBe("retrying");
    expect(updateCall.data.attempts).toBe(1);
    // 1m backoff -> nextAttemptAt at least ~60s in future.
    expect(updateCall.data.nextAttemptAt.getTime() - before).toBeGreaterThan(
      55_000,
    );
    expect(updateCall.data.lastError).toContain("503");
  });

  it("transitions to failed once attempts reach maxAttempts", async () => {
    fetchSpy.mockResolvedValue(
      new Response("upstream down", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );
    mockPrisma.emailJob.findMany.mockResolvedValue([
      makeJob({ attempts: 4, maxAttempts: 5 }),
    ]);
    mockPrisma.emailJob.update.mockResolvedValue({});

    const result = await processEmailQueue();

    expect(result.failed).toBe(1);
    expect(result.retrying).toBe(0);

    const updateCall = mockPrisma.emailJob.update.mock.calls[0]?.[0] as {
      data: { status: string; attempts: number };
    };
    expect(updateCall.data.status).toBe("failed");
    expect(updateCall.data.attempts).toBe(5);
    expect(console.error).toHaveBeenCalledWith(
      "[L-TEX] EmailJob exhausted retries",
      expect.objectContaining({
        id: "job1",
        source: "order",
        to: "al***@example.com",
        attempts: 5,
      }),
    );
  });

  it("masks PII inside lastError before persisting", async () => {
    fetchSpy.mockRejectedValue(
      new Error("delivery to alice@example.com timed out"),
    );
    mockPrisma.emailJob.findMany.mockResolvedValue([makeJob()]);
    mockPrisma.emailJob.update.mockResolvedValue({});

    await processEmailQueue();

    const updateCall = mockPrisma.emailJob.update.mock.calls[0]?.[0] as {
      data: { lastError: string };
    };
    expect(updateCall.data.lastError).toContain("al***@example.com");
    expect(updateCall.data.lastError).not.toContain("alice@example.com");
  });

  it("processes multiple jobs and aggregates counts", async () => {
    let call = 0;
    fetchSpy.mockImplementation(async () => {
      call++;
      if (call === 1) return new Response("ok", { status: 200 });
      return new Response("down", { status: 503, statusText: "down" });
    });
    mockPrisma.emailJob.findMany.mockResolvedValue([
      makeJob({ id: "a" }),
      makeJob({ id: "b", attempts: 4, maxAttempts: 5 }),
    ]);
    mockPrisma.emailJob.update.mockResolvedValue({});

    const result = await processEmailQueue();

    expect(result.processed).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.retrying).toBe(0);
  });
});
