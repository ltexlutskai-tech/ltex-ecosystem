/**
 * Register Telegram bot webhook.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx SITE_URL=https://your-site.netlify.app npx tsx scripts/register-telegram-webhook.ts
 *
 * Optional:
 *   TELEGRAM_WEBHOOK_SECRET — secret token for webhook verification (recommended)
 *
 * To check current webhook status:
 *   curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
 */

const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Error: TELEGRAM_BOT_TOKEN environment variable is required.");
  console.error("Get it from @BotFather on Telegram: https://t.me/BotFather");
  process.exit(1);
}

if (!SITE_URL) {
  console.error(
    "Error: SITE_URL or NEXT_PUBLIC_SITE_URL environment variable is required.",
  );
  console.error("Example: SITE_URL=https://ltex.com.ua");
  process.exit(1);
}

async function main() {
  const webhookUrl = `${SITE_URL}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

  console.log(`Registering Telegram webhook...`);
  console.log(`  URL: ${webhookUrl}`);
  console.log(`  Secret: ${secret ? "(set)" : "(not set)"}`);
  console.log();

  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret || undefined,
        allowed_updates: ["message", "callback_query", "inline_query"],
      }),
    },
  );

  const data = await res.json();

  if (data.ok) {
    console.log(`Telegram webhook registered successfully.`);
    console.log(`Description: ${data.description}`);
  } else {
    console.error(`Failed to register Telegram webhook.`);
    console.error(`Error: ${data.description}`);
    process.exit(1);
  }

  // Show current webhook info
  console.log("\nCurrent webhook info:");
  const infoRes = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`,
  );
  const info = await infoRes.json();
  if (info.ok) {
    console.log(`  URL: ${info.result.url}`);
    console.log(
      `  Has secret: ${info.result.has_custom_certificate ? "yes" : "no"}`,
    );
    console.log(`  Pending updates: ${info.result.pending_update_count}`);
    if (info.result.last_error_message) {
      console.log(`  Last error: ${info.result.last_error_message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
