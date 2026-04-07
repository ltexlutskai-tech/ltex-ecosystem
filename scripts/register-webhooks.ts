/**
 * Register Telegram and Viber webhooks.
 * Usage: SITE_URL=https://your-site.netlify.app npx tsx scripts/register-webhooks.ts
 */

const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;

async function registerTelegramWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log("⏭️  TELEGRAM_BOT_TOKEN not set — skipping Telegram webhook");
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const url = `${SITE_URL}/api/telegram/webhook`;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret || undefined,
        allowed_updates: ["message", "callback_query", "inline_query"],
      }),
    }
  );

  const data = await res.json();
  if (data.ok) {
    console.log(`✅ Telegram webhook registered: ${url}`);
  } else {
    console.error(`❌ Telegram webhook failed:`, data.description);
  }
}

async function registerViberWebhook() {
  const token = process.env.VIBER_AUTH_TOKEN;
  if (!token) {
    console.log("⏭️  VIBER_AUTH_TOKEN not set — skipping Viber webhook");
    return;
  }

  const url = `${SITE_URL}/api/viber/webhook`;

  const res = await fetch("https://chatapi.viber.com/pa/set_webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Viber-Auth-Token": token,
    },
    body: JSON.stringify({
      url,
      event_types: [
        "delivered",
        "seen",
        "failed",
        "subscribed",
        "unsubscribed",
        "conversation_started",
      ],
      send_name: true,
      send_photo: false,
    }),
  });

  const data = await res.json();
  if (data.status === 0) {
    console.log(`✅ Viber webhook registered: ${url}`);
  } else {
    console.error(`❌ Viber webhook failed:`, data.status_message);
  }
}

async function main() {
  if (!SITE_URL) {
    console.error("❌ Set SITE_URL or NEXT_PUBLIC_SITE_URL environment variable");
    process.exit(1);
  }

  console.log(`🔗 Registering webhooks for: ${SITE_URL}\n`);

  await registerTelegramWebhook();
  await registerViberWebhook();

  console.log("\n✅ Done!");
}

main().catch(console.error);
