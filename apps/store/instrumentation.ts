/**
 * Next.js instrumentation — runs once at server startup.
 * Warns about missing optional env vars so operators know
 * which features are disabled in the current deployment.
 */

/**
 * Validate that critical secrets meet minimum strength requirements.
 * Throws in production if secrets are missing or too short.
 * Exported for testability.
 */
export function validateProductionSecrets(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NODE_ENV !== "production") return;

  const mobileSecret = env.MOBILE_JWT_SECRET;
  if (!mobileSecret || mobileSecret.length < 32) {
    throw new Error(
      "MOBILE_JWT_SECRET must be at least 32 characters. " +
        "Generate with: openssl rand -hex 32",
    );
  }

  const syncKey = env.SYNC_API_KEY;
  if (!syncKey || syncKey.length < 32) {
    throw new Error(
      "SYNC_API_KEY must be at least 32 characters. " +
        "Generate with: openssl rand -hex 32",
    );
  }
}

export function register() {
  validateProductionSecrets();

  const optional: { key: string; feature: string }[] = [
    { key: "TELEGRAM_BOT_TOKEN", feature: "Telegram order notifications" },
    { key: "TELEGRAM_CHAT_ID", feature: "Telegram order notifications" },
    { key: "VIBER_AUTH_TOKEN", feature: "Viber bot / notifications" },
    { key: "NOVA_POSHTA_API_KEY", feature: "Nova Poshta shipment tracking" },
    { key: "SYNC_API_KEY", feature: "1C sync API authentication" },
    { key: "NEXT_PUBLIC_SITE_URL", feature: "Canonical URLs & OG meta" },
  ];

  const emailConfigured =
    (process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS) ||
    process.env.RESEND_API_KEY;

  if (!emailConfigured) {
    console.warn(
      "[L-TEX] Email not configured (set SMTP_HOST/PORT/USER/PASS or RESEND_API_KEY). Order email notifications disabled.",
    );
  }

  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) {
    console.warn(
      "[L-TEX] CRON_SECRET missing or too short — /api/cron/* endpoints disabled (always return 401).",
    );
  }

  const missing = optional.filter(({ key }) => !process.env[key]);
  if (missing.length > 0) {
    for (const { key, feature } of missing) {
      console.warn(`[L-TEX] ${key} not set — ${feature} disabled.`);
    }
  }
}
