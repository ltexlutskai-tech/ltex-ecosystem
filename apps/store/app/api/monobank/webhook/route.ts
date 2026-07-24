import { NextRequest, NextResponse } from "next/server";
import { ingestMonoStatementItems } from "@/lib/bank/ingest";
import type { MonoStatementItem } from "@/lib/bank/monobank";

export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 16;

/**
 * Webhook Monobank — пуш про кожен новий рух по рахунку (реальний час).
 *
 * Monobank не підписує вебхуки, тому автентичність забезпечує секрет у самому
 * URL (`?token=<MONOBANK_WEBHOOK_SECRET>`): URL реєструємо ми самі через
 * POST /personal/webhook, назовні він ніде не публікується.
 *
 * ⚠️ Cloudflare WAF: шлях /api/monobank/webhook треба додати у правило
 * «Skip WAF for bot webhooks» (як Viber/Telegram) — інакше POST банку
 * блокується Managed Rules.
 */
function authorize(request: NextRequest): boolean {
  const secret = process.env.MONOBANK_WEBHOOK_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;
  return request.nextUrl.searchParams.get("token") === secret;
}

/** GET — перевірка URL Монобанком при реєстрації вебхука (очікує 200). */
export async function GET() {
  return NextResponse.json({ ok: true });
}

interface MonoWebhookBody {
  type?: string;
  data?: { account?: string; statementItem?: MonoStatementItem };
}

/**
 * POST — доставка StatementItem. Відповідаємо 200 завжди після спроби
 * обробки: дедуп по банківському id робить повторні доставки безпечними, а
 * втрачений через збій БД рух доллється фоновим дозбором (cron bank-sync).
 */
export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MonoWebhookBody | null = null;
  try {
    body = (await request.json()) as MonoWebhookBody;
  } catch {
    // Не-JSON тіло — ігноруємо (200, щоб банк не вимкнув вебхук).
  }

  const account = body?.data?.account;
  const item = body?.data?.statementItem;
  if (body?.type === "StatementItem" && account && item?.id) {
    try {
      await ingestMonoStatementItems(account, [item]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      console.error("[L-TEX] monobank webhook ingest failed", {
        error: message,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
