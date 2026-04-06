/**
 * L-TEX Viber Bot
 *
 * Viber bots work ONLY via webhooks (no polling mode).
 * To set up: run this file with VIBER_WEBHOOK_URL set.
 *
 * Required env vars:
 * - VIBER_AUTH_TOKEN — from https://partners.viber.com/
 * - DATABASE_URL
 *
 * Optional:
 * - VIBER_WEBHOOK_URL — sets webhook on startup
 * - NEXT_PUBLIC_SITE_URL — for product links
 */

import { setWebhook, type ViberWebhookEvent } from "./viber";
import { handleEvent } from "./handlers";

export { handleEvent };
export type { ViberWebhookEvent };

// ─── Process a single webhook event ──────────────────────────────────────────

export async function processEvent(event: ViberWebhookEvent): Promise<void> {
  try {
    await handleEvent(event);
  } catch (error) {
    console.error("Error processing Viber event:", error);
  }
}

// ─── Startup: register webhook ───────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.VIBER_AUTH_TOKEN) {
    console.error("VIBER_AUTH_TOKEN is required");
    process.exit(1);
  }

  const webhookUrl = process.env.VIBER_WEBHOOK_URL;
  if (webhookUrl) {
    await setWebhook(webhookUrl);
    console.log("Viber bot webhook registered. Waiting for events...");
  } else {
    console.log("No VIBER_WEBHOOK_URL set. Set it and restart to register webhook.");
    console.log("Viber does not support polling — webhook is required.");
  }
}

const isMainModule = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isMainModule) {
  main();
}
