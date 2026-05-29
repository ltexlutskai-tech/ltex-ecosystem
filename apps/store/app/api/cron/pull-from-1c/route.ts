import { NextRequest, NextResponse } from "next/server";
import { runPullFromOnec } from "@/lib/sync/pull-from-1c";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
 * GET/POST /api/cron/pull-from-1c
 *
 * INBOUND polling cron — pull snapshot from 1С (Етап 3 master-плану
 * `docs/1C_INTEGRATION_PLAN.md`).
 *
 * Flow:
 *   1. Прочитати `MgrSyncState.value` де `key='last_sync_cursor'` (може не
 *      існувати на першому запуску → cursor = undefined → 1С зробить повний
 *      дамп).
 *   2. POST `MANAGER_SYNC_URL/pull/snapshot` з `{cursor}` → SOAP →
 *      `СформуватиПакетДаннихJSON` → JSON snapshot.
 *   3. Форвардити кожен масив у відповідний `/api/sync/*` endpoint
 *      батчами по 50.
 *   4. Якщо ВСІ endpoint-и успішні → зберегти новий `syncCursor` у
 *      `MgrSyncState`. Якщо хоч один частково впав — лишити cursor
 *      на попередньому значенні (наступний cron повторить).
 *
 * Запускається через Windows Scheduled Task (~5хв інтервал, див.
 * `docs/PULL_FROM_1C_TASK.md`).
 *
 * Auth: `x-cron-secret` header (preferred), `Authorization: Bearer …`,
 * або `?token=` query. Configure via `CRON_SECRET` env (≥16 chars).
 */
export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPullFromOnec();
    if (result.ok === false && result.status === "soap_failed") {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: "exception",
        errorMessage: (err as Error)?.message ?? String(err),
      },
      { status: 500 },
    );
  }
}

// POST дублює GET — деякі cron-runner-и шлять POST за дефолтом.
export async function POST(request: NextRequest) {
  return GET(request);
}
