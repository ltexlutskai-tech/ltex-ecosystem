import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  notifyNewLead,
  notifyNewOrder,
  notifyNewsletterSubscribe,
} from "./notifications";

const mockOrder = {
  orderId: "order-123",
  customerName: "Іван Петров",
  customerPhone: "+380676710515",
  totalEur: 150.5,
  totalUah: 6020.0,
  itemCount: 3,
  totalWeight: 25.5,
};

describe("notifyNewOrder", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("sends both Telegram and Viber notifications when configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat-id");
    vi.stubEnv("VIBER_AUTH_TOKEN", "test-viber-token");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "test-viber-user");

    await notifyNewOrder(mockOrder);

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Telegram call
    const telegramCall = fetchSpy.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("api.telegram.org"),
    );
    expect(telegramCall).toBeDefined();
    const telegramBody = JSON.parse(telegramCall![1]!.body as string);
    expect(telegramBody.chat_id).toBe("test-chat-id");
    expect(telegramBody.parse_mode).toBe("MarkdownV2");
    expect(telegramBody.text).toContain("Нове замовлення");

    // Viber call
    const viberCall = fetchSpy.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("chatapi.viber.com"),
    );
    expect(viberCall).toBeDefined();
    const viberBody = JSON.parse(viberCall![1]!.body as string);
    expect(viberBody.receiver).toBe("test-viber-user");
    expect(viberBody.type).toBe("text");
    expect(viberBody.text).toContain("Нове замовлення");
  });

  it("skips Telegram when env vars are missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    vi.stubEnv("VIBER_AUTH_TOKEN", "test-viber-token");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "test-viber-user");

    await notifyNewOrder(mockOrder);

    const telegramCall = fetchSpy.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("api.telegram.org"),
    );
    expect(telegramCall).toBeUndefined();
  });

  it("skips Viber when env vars are missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat-id");
    vi.stubEnv("VIBER_AUTH_TOKEN", "");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "");

    await notifyNewOrder(mockOrder);

    const viberCall = fetchSpy.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("chatapi.viber.com"),
    );
    expect(viberCall).toBeUndefined();
  });

  it("does nothing when no notification channels configured", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    vi.stubEnv("VIBER_AUTH_TOKEN", "");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "");

    await notifyNewOrder(mockOrder);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not throw when Telegram fetch fails", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat-id");
    vi.stubEnv("VIBER_AUTH_TOKEN", "");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "");

    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    // Should not throw
    await expect(notifyNewOrder(mockOrder)).resolves.toBeUndefined();
  });

  it("does not throw when Viber fetch fails", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    vi.stubEnv("VIBER_AUTH_TOKEN", "test-viber-token");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "test-viber-user");

    fetchSpy.mockRejectedValueOnce(new Error("Network error"));

    await expect(notifyNewOrder(mockOrder)).resolves.toBeUndefined();
  });

  it("includes order details in Telegram message", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat-id");
    vi.stubEnv("VIBER_AUTH_TOKEN", "");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "");

    await notifyNewOrder(mockOrder);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    const text = body.text as string;
    expect(text).toContain("25.5");
    expect(text).toContain("150.50");
    expect(text).toContain("6020.00");
    expect(text).toContain("3");
  });

  it("includes order details in Viber message", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    vi.stubEnv("VIBER_AUTH_TOKEN", "test-viber-token");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "test-viber-user");

    await notifyNewOrder(mockOrder);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    const text = body.text as string;
    expect(text).toContain("25.5");
    expect(text).toContain("150.50");
    expect(text).toContain("+380676710515");
  });

  it("escapes markdown special characters in Telegram message", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat-id");
    vi.stubEnv("VIBER_AUTH_TOKEN", "");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "");

    const orderWithSpecialChars = {
      ...mockOrder,
      customerName: "Test_User (special)",
    };

    await notifyNewOrder(orderWithSpecialChars);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    const text = body.text as string;
    // Should escape _ and ( and )
    expect(text).toContain("Test\\_User");
    expect(text).toContain("\\(special\\)");
  });
});

describe("notifyNewsletterSubscribe", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const payload = {
    email: "user@example.com",
    source: "footer",
    subscribedAt: new Date("2026-04-25T12:00:00Z"),
  };

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("posts to Telegram when both env vars set", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewsletterSubscribe(payload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.chat_id).toBe("newsletter-chat-id");
    expect(body.text).toContain("Нова підписка на новинки");
    expect(body.text).toContain("user@example.com");
    expect(body.text).toContain("footer");
  });

  it("skips when NEWSLETTER_TELEGRAM_CHAT_ID is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "");

    await notifyNewsletterSubscribe(payload);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });

  it("skips when TELEGRAM_BOT_TOKEN is missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewsletterSubscribe(payload);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not throw on network failure", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");
    fetchSpy.mockRejectedValueOnce(new Error("network"));

    await expect(notifyNewsletterSubscribe(payload)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("warns on non-OK response", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");
    fetchSpy.mockResolvedValueOnce(
      new Response("Bad request", { status: 400 }),
    );

    await notifyNewsletterSubscribe(payload);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("notifyNewLead", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const params = {
    customerId: "cust-123",
    phone: "+380671234567",
    name: "Іван Петров",
    source: "web" as const,
  };

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("posts to Telegram with full phone in body when both env vars set", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewLead(params);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.chat_id).toBe("newsletter-chat-id");
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.text).toContain("Новий лід");
    expect(body.text).toContain("Іван Петров");
    // Manager needs full phone in the actual message
    expect(body.text).toContain("+380671234567");
    expect(body.text).toContain("web");
    expect(body.text).toContain("cust-123");
  });

  it("returns silently when TELEGRAM_BOT_TOKEN missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await expect(notifyNewLead(params)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns silently when NEWSLETTER_TELEGRAM_CHAT_ID missing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "");

    await expect(notifyNewLead(params)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not throw on network failure and masks phone in log", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");
    fetchSpy.mockRejectedValueOnce(new Error("network"));

    await expect(notifyNewLead(params)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    // The masked phone log payload must NOT contain the raw phone middle digits.
    const allLoggedArgs = warnSpy.mock.calls.flat();
    const serialized = JSON.stringify(allLoggedArgs);
    expect(serialized).not.toContain("+380671234567");
    expect(serialized).toContain("***");
  });

  it("warns on non-OK Telegram response without throwing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");
    fetchSpy.mockResolvedValueOnce(
      new Response("Bad request", { status: 400 }),
    );

    await expect(notifyNewLead(params)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("escapes Markdown special characters in name", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewLead({
      ...params,
      name: "Test_User (special)",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    const text = body.text as string;
    expect(text).toContain("Test\\_User");
    expect(text).toContain("\\(special\\)");
  });

  it("defaults source to 'web' when omitted", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewLead({
      customerId: "c-1",
      phone: "+380501112233",
      name: "Іван",
    });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.text).toContain("web");
  });

  it("includes the Область line when city is provided", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewLead({ ...params, city: "Волинська" });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    const text = body.text as string;
    expect(text).toContain("Область");
    expect(text).toContain("Волинська");
  });

  it("omits the Область line when city is null or undefined", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "bot-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewLead({ ...params, city: null });

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    const text = body.text as string;
    expect(text).not.toContain("Область");
  });
});

describe("TELEGRAM_NOTIFICATIONS_BOT_TOKEN takes precedence over TELEGRAM_BOT_TOKEN", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("notifyNewOrder uses notifications bot token when both are set", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "inbox-token");
    vi.stubEnv("TELEGRAM_NOTIFICATIONS_BOT_TOKEN", "notifications-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "test-chat-id");
    vi.stubEnv("VIBER_AUTH_TOKEN", "");
    vi.stubEnv("VIBER_ADMIN_USER_ID", "");

    await notifyNewOrder(mockOrder);

    const telegramCall = fetchSpy.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes("api.telegram.org"),
    );
    expect(telegramCall).toBeDefined();
    expect(telegramCall![0] as string).toContain("/botnotifications-token/");
    expect(telegramCall![0] as string).not.toContain("/botinbox-token/");
  });

  it("notifyNewsletterSubscribe uses notifications bot token when both are set", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "inbox-token");
    vi.stubEnv("TELEGRAM_NOTIFICATIONS_BOT_TOKEN", "notifications-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewsletterSubscribe({
      email: "user@example.com",
      source: "footer",
      subscribedAt: new Date("2026-04-25T12:00:00Z"),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0] as string).toBe(
      "https://api.telegram.org/botnotifications-token/sendMessage",
    );
  });

  it("notifyNewLead uses notifications bot token when both are set, with fallback when only TELEGRAM_BOT_TOKEN set", async () => {
    // Case A: both set → notifications wins
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "inbox-token");
    vi.stubEnv("TELEGRAM_NOTIFICATIONS_BOT_TOKEN", "notifications-token");
    vi.stubEnv("NEWSLETTER_TELEGRAM_CHAT_ID", "newsletter-chat-id");

    await notifyNewLead({
      customerId: "cust-123",
      phone: "+380671234567",
      name: "Іван",
      source: "web",
    });

    expect(fetchSpy.mock.calls[0]![0] as string).toBe(
      "https://api.telegram.org/botnotifications-token/sendMessage",
    );

    // Case B: only TELEGRAM_BOT_TOKEN set (notifications token unset) →
    // fallback to inbox token (backward compat for single-bot deployments).
    fetchSpy.mockClear();
    vi.stubEnv("TELEGRAM_NOTIFICATIONS_BOT_TOKEN", undefined);

    await notifyNewLead({
      customerId: "cust-456",
      phone: "+380501112233",
      name: "Петро",
      source: "web",
    });

    expect(fetchSpy.mock.calls[0]![0] as string).toBe(
      "https://api.telegram.org/botinbox-token/sendMessage",
    );
  });
});
