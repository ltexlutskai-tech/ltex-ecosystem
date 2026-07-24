import { NextRequest, NextResponse } from "next/server";
import { runBankSync } from "@/lib/bank/ingest";

export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 16;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return false;

  const headerSecret = request.headers.get("x-cron-secret");
  if (headerSecret && headerSecret === secret) return true;

  const auth = request.headers.get("authorization");
  if (auth) {
    const [scheme, token] = auth.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token === secret) return true;
  }

  const queryToken = request.nextUrl.searchParams.get("token");
  if (queryToken === secret) return true;

  return false;
}

/**
 * GET /api/cron/bank-sync
 *
 * Фоновий синк банківського фіда (Monobank): оновлення рахунків/залишків +
 * резервний дозбір виписки (основний канал — webhook). Робить максимум один
 * виклик API банку за прогін (ліміт Monobank 1 запит/60с). Auth: той самий
 * CRON_SECRET, що й інші крони. Запускати з Windows Task Scheduler кожні 5 хв.
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runBankSync();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[L-TEX] bank-sync failed", { error: message });
    return NextResponse.json(
      { mode: "error", detail: message },
      { status: 500 },
    );
  }
}
