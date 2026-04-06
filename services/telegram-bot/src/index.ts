/**
 * L-TEX Telegram Bot
 *
 * Modes:
 * - Webhook: Set TELEGRAM_WEBHOOK_URL and call POST /api/telegram/webhook
 * - Polling: Run this file directly (for local dev)
 *
 * Required env vars:
 * - TELEGRAM_BOT_TOKEN
 * - DATABASE_URL
 *
 * Optional:
 * - TELEGRAM_WEBHOOK_URL — if set, registers webhook on startup
 * - NEXT_PUBLIC_SITE_URL — for product links (default: https://ltex.com.ua)
 */

import {
  getUpdates,
  setWebhook,
  type TelegramUpdate,
} from "./telegram";
import { handleMessage, handleCallbackQuery, handleInlineQuery } from "./handlers";

export { handleMessage, handleCallbackQuery, handleInlineQuery };
export type { TelegramUpdate };

// ─── Process a single update ─────────────────────────────────────────────────

export async function processUpdate(update: TelegramUpdate): Promise<void> {
  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.inline_query) {
      await handleInlineQuery(update.inline_query);
    }
  } catch (error) {
    console.error("Error processing update:", error);
  }
}

// ─── Polling mode (for local development) ────────────────────────────────────

async function startPolling(): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN is required");
    process.exit(1);
  }

  // Register webhook if URL provided
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
  if (webhookUrl) {
    await setWebhook(webhookUrl);
    console.log("Webhook mode — bot is ready. Updates will arrive via webhook.");
    return;
  }

  console.log("Polling mode — listening for updates...");
  let offset: number | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        await processUpdate(update);
        offset = update.update_id + 1;
      }
    } catch (error) {
      console.error("Polling error:", error);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMainModule) {
  startPolling();
}
