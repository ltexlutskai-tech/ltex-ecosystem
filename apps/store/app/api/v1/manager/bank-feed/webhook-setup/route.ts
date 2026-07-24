import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canManageTreasury } from "@/lib/manager/treasury-permission";
import { isMonoConfigured, setWebhook } from "@/lib/bank/monobank";
import { syncMonoAccounts } from "@/lib/bank/ingest";

const MIN_SECRET_LENGTH = 16;
const DEFAULT_WEBHOOK_BASE = "https://new.ltex.com.ua/api/monobank/webhook";

/**
 * POST /api/v1/manager/bank-feed/webhook-setup — кнопка «Підключити» на
 * сторінці «Банк»: реєструє наш webhook у Monobank (банк одразу робить
 * GET-перевірку URL) і одразу тягне client-info (рахунки + залишки).
 *
 * URL вебхука: env MONOBANK_WEBHOOK_URL (без query) або дефолтний прод-домен;
 * секрет доклеюється автоматично (`?token=MONOBANK_WEBHOOK_SECRET`).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!canManageTreasury(user.role)) {
    return NextResponse.json({ error: "Недостатньо прав" }, { status: 403 });
  }

  if (!isMonoConfigured()) {
    return NextResponse.json(
      { error: "MONOBANK_TOKEN не налаштовано у .env" },
      { status: 400 },
    );
  }
  const secret = process.env.MONOBANK_WEBHOOK_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return NextResponse.json(
      { error: "MONOBANK_WEBHOOK_SECRET не налаштовано (≥16 символів)" },
      { status: 400 },
    );
  }

  const base = process.env.MONOBANK_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_BASE;
  const url = `${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(secret)}`;

  const hook = await setWebhook(url);
  if (!hook.ok) {
    return NextResponse.json({ error: hook.error }, { status: 502 });
  }

  // Одразу відкриваємо рахунки/залишки (1 виклик client-info).
  const accounts = await syncMonoAccounts();

  return NextResponse.json({
    ok: true,
    accounts: accounts.ok ? accounts.accounts : 0,
    accountsError: accounts.ok ? undefined : accounts.error,
  });
}
