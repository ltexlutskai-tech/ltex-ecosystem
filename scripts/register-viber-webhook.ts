/**
 * Register Viber bot webhook.
 *
 * Usage:
 *   VIBER_AUTH_TOKEN=xxx SITE_URL=https://your-site.netlify.app npx tsx scripts/register-viber-webhook.ts
 *
 * Get your auth token from: https://partners.viber.com/
 * The webhook URL must be HTTPS (Viber requirement).
 */

const SITE_URL = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
const AUTH_TOKEN = process.env.VIBER_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error("Error: VIBER_AUTH_TOKEN environment variable is required.");
  console.error("Get it from: https://partners.viber.com/");
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
  const webhookUrl = `${SITE_URL}/api/viber/webhook`;

  console.log(`Registering Viber webhook...`);
  console.log(`  URL: ${webhookUrl}`);
  console.log();

  const res = await fetch("https://chatapi.viber.com/pa/set_webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Viber-Auth-Token": AUTH_TOKEN,
    },
    body: JSON.stringify({
      url: webhookUrl,
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
    console.log(`Viber webhook registered successfully.`);
    console.log(`Status message: ${data.status_message}`);
    if (data.event_types) {
      console.log(`Event types: ${data.event_types.join(", ")}`);
    }
  } else {
    console.error(`Failed to register Viber webhook.`);
    console.error(`Status: ${data.status}`);
    console.error(`Message: ${data.status_message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
