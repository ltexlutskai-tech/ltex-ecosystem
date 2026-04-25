/**
 * Order notification utilities.
 *
 * Sends notifications to admin channels when a new order is placed.
 * - Telegram: requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 * - Viber: requires VIBER_AUTH_TOKEN and VIBER_ADMIN_USER_ID env vars.
 * Gracefully no-ops per channel if not configured.
 *
 * Newsletter subscriptions use a separate Telegram chat
 * (NEWSLETTER_TELEGRAM_CHAT_ID) so manager can monitor signups in a
 * dedicated channel.
 */

interface OrderNotification {
  orderId: string;
  customerName: string;
  customerPhone: string;
  totalEur: number;
  totalUah: number;
  itemCount: number;
  totalWeight: number;
}

interface NewsletterNotification {
  email: string;
  source?: string;
  subscribedAt: Date;
}

export async function notifyNewOrder(order: OrderNotification): Promise<void> {
  await Promise.allSettled([
    sendTelegramNotification(order),
    sendViberNotification(order),
  ]);
}

async function sendTelegramNotification(
  order: OrderNotification,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) return;

  const text = [
    `🛒 *Нове замовлення!*`,
    ``,
    `*Клієнт:* ${escapeMarkdown(order.customerName)}`,
    `*Телефон:* ${escapeMarkdown(order.customerPhone)}`,
    `*Позицій:* ${order.itemCount}`,
    `*Вага:* ${order.totalWeight.toFixed(1)} кг`,
    `*Сума:* €${order.totalEur.toFixed(2)} / ${order.totalUah.toFixed(2)} ₴`,
    ``,
    `[Переглянути в адмінці](${process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua"}/admin/orders)`,
  ].join("\n");

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Silently fail — don't break order flow for notification issues
    console.error("Failed to send Telegram notification");
  }
}

async function sendViberNotification(order: OrderNotification): Promise<void> {
  const authToken = process.env.VIBER_AUTH_TOKEN;
  const adminUserId = process.env.VIBER_ADMIN_USER_ID;

  if (!authToken || !adminUserId) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

  const text = [
    `🛒 Нове замовлення!`,
    ``,
    `Клієнт: ${order.customerName}`,
    `Телефон: ${order.customerPhone}`,
    `Позицій: ${order.itemCount}`,
    `Вага: ${order.totalWeight.toFixed(1)} кг`,
    `Сума: €${order.totalEur.toFixed(2)} / ${order.totalUah.toFixed(2)} ₴`,
    ``,
    `Переглянути: ${siteUrl}/admin/orders`,
  ].join("\n");

  try {
    await fetch("https://chatapi.viber.com/pa/send_message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Viber-Auth-Token": authToken,
      },
      body: JSON.stringify({
        receiver: adminUserId,
        type: "text",
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Silently fail — don't break order flow for notification issues
    console.error("Failed to send Viber notification");
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export async function notifyNewsletterSubscribe(
  payload: NewsletterNotification,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.NEWSLETTER_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.info(
      "[L-TEX] NEWSLETTER_TELEGRAM_CHAT_ID or TELEGRAM_BOT_TOKEN not set — Telegram newsletter notification disabled.",
    );
    return;
  }

  const text = [
    "📬 Нова підписка на новинки",
    "",
    `Email: ${payload.email}`,
    `Джерело: ${payload.source ?? "footer"}`,
    `Дата: ${payload.subscribedAt.toISOString()}`,
  ].join("\n");

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) {
      console.warn(
        `[L-TEX] Telegram newsletter notification failed: ${res.status}`,
      );
    }
  } catch (err) {
    console.warn("[L-TEX] Telegram newsletter notification error:", err);
  }
}
