import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifyNewOrder } from "./notifications";

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
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
