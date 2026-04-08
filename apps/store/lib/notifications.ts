/**
 * Order notification utilities.
 *
 * Sends notifications to admin channels when a new order is placed.
 * - Telegram: requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 * - Viber: requires VIBER_AUTH_TOKEN and VIBER_ADMIN_USER_ID env vars.
 * Gracefully no-ops per channel if not configured.
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
    });
  } catch {
    // Silently fail — don't break order flow for notification issues
    console.error("Failed to send Viber notification");
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
