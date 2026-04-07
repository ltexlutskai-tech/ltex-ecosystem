/**
 * Register bot menu commands via Telegram BotFather API (setMyCommands).
 *
 * Usage:
 *   npx tsx services/telegram-bot/src/setup-commands.ts
 *
 * Requires TELEGRAM_BOT_TOKEN env var (or .env file in project root).
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set.");
  console.error("Set it as an environment variable or in a .env file.");
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

const commands = [
  { command: "search", description: "Пошук товарів" },
  { command: "lots", description: "Доступні лоти (мішки)" },
  { command: "order", description: "Статус замовлення" },
  { command: "categories", description: "Категорії товарів" },
  { command: "help", description: "Допомога" },
];

async function main() {
  console.log("Setting bot commands...");

  const res = await fetch(`${API_BASE}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });

  const data = await res.json();

  if (data.ok) {
    console.log("Bot commands registered successfully:");
    for (const cmd of commands) {
      console.log(`  /${cmd.command} — ${cmd.description}`);
    }
  } else {
    console.error("Failed to set commands:", data.description);
    process.exit(1);
  }
}

main();
