import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isTransientError, maskEmail, sendWithRetry } from "./email";

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
