import { NextRequest, NextResponse } from "next/server";

import { recomputeClientStatuses } from "@/lib/manager/recompute-client-statuses";

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
 * GET /api/cron/recompute-client-statuses
 *
 * Авто-перерахунок статусів контрагентів (порт 1С ScheduledJob
 * `ИзменениеСтатусовКонтрагентов`). Рахує продажі за поточний/попередній місяць
 * з наших `Sale` і оновлює `MgrClient.statusGeneral` / `statusOperational` +
 * пише `ClientStatusHistory`.
 *
 * Auth: `x-cron-secret` header (preferred), `Authorization: Bearer ...`,
 * або `?token=` query param. Налаштовується через CRON_SECRET env (≥16 chars).
 *
 * Запускати з Windows Task Scheduler РАЗ НА МІСЯЦЬ (як у 1С). Запуск частіше —
 * безпечний (idempotent), просто переобчислює ті самі періоди.
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await recomputeClientStatuses();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[L-TEX] recompute-client-statuses failed", {
      error: message,
    });
    return NextResponse.json(
      {
        processed: 0,
        generalChanged: 0,
        operationalChanged: 0,
        newToPotential: 0,
        historyWritten: 0,
        error: message,
      },
      { status: 500 },
    );
  }
}
