/**
 * Order notification utilities.
 *
 * Sends a Telegram message to the admin when a new order is placed.
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.
 * Gracefully no-ops if not configured.
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
  await sendTelegramNotification(order);
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

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
