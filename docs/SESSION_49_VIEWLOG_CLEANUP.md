# Session 49 — Worker Task: ViewLog Cleanup Endpoint

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P3 (DB hygiene — попереджає infinite зростання `view_log` таблиці)
**Очікуваний ефорт:** 30-45 хвилин
**Тип:** worker session
**Передумови:** S43 merged (ViewLog model + tracking endpoint live)

---

## Контекст

S43 додав `ViewLog` table що логує кожен product view (mobile тільки зараз, web пізніше у S48). Без cleanup таблиця ростиме infinite — сотні views на день × 365 днів × кілька років = мільйони рядків. Запит `recommendations` робить `findMany take:20` з index-ом `(customer_id, viewed_at)` — лінійна performance деградація рано чи пізно.

Stack для cleanup:

1. **Cron-приватний endpoint** `/api/cron/cleanup-viewlog` (DELETE або POST з secret token)
2. **Drop entries старші 90 днів** (recommendations algorithm дивиться лише 30 днів backward)
3. **Ручний trigger** через server-side scheduled task (Windows Task Scheduler) — окрема user-action для setup, не в цій worker сесії
4. **Безпека**: secret token у env, без auth — публічний URL небезпечний

S49 додає лиш endpoint + тести. User-side setup Windows Scheduled Task — окрема documentation.

---

## Branch

`claude/session-49-viewlog-cleanup` від main.

---

## Hard rules

1. Endpoint method: `POST /api/cron/cleanup-viewlog` (НЕ GET — destructive). Secret через `Authorization: Bearer <token>` header АБО `?token=<secret>` query param.
2. Secret env var: `CRON_SECRET` (новий). Перевірка startup-time через існуючий `instrumentation.ts` pattern (як `MOBILE_JWT_SECRET`).
3. Hard delete: `prisma.viewLog.deleteMany({ where: { viewedAt: { lt: cutoff } } })`. NOT soft-delete (немає `deletedAt` field у schema).
4. Cutoff: 90 days. Configurable через query param `?days=N` (default 90, min 30, max 365).
5. Response shape: `{ deleted: number, cutoff: string }` для logging/monitoring.
6. Rate-limit не потрібен (admin-only endpoint, не public).
7. CI: 271 unit baseline + format + typecheck + build green. +3 тести (success, 401 без secret, custom days param).

---

## Файли

### 1. New endpoint

**`apps/store/app/api/cron/cleanup-viewlog/route.ts`** (new)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 90;
const MIN_DAYS = 30;
const MAX_DAYS = 365;

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;

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
 * POST /api/cron/cleanup-viewlog?days=90
 *
 * Drops ViewLog entries older than `days` days. Default 90, min 30, max 365.
 * Auth: Bearer <CRON_SECRET> header or ?token=<CRON_SECRET> query param.
 */
export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const daysParam = searchParams.get("days");
  let days = DEFAULT_DAYS;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (!isNaN(parsed) && parsed >= MIN_DAYS && parsed <= MAX_DAYS) {
      days = parsed;
    }
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await prisma.viewLog.deleteMany({
    where: { viewedAt: { lt: cutoff } },
  });

  return NextResponse.json({
    deleted: result.count,
    cutoff: cutoff.toISOString(),
    days,
  });
}
```

### 2. Tests

**`apps/store/app/api/cron/cleanup-viewlog/route.test.ts`** (new) — 3 cases:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@ltex/db", () => ({
  prisma: { viewLog: { deleteMany: vi.fn() } },
}));

const SECRET = "test_secret_must_be_long_enough";

describe("POST /api/cron/cleanup-viewlog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
  });

  it("401 without secret", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://test.local/api/cron/cleanup-viewlog", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("deletes with default 90 days", async () => {
    const { prisma } = await import("@ltex/db");
    (prisma.viewLog.deleteMany as any).mockResolvedValue({ count: 42 });

    const { POST } = await import("./route");
    const req = new NextRequest("http://test.local/api/cron/cleanup-viewlog", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(42);
    expect(body.days).toBe(90);
  });

  it("respects custom days param", async () => {
    const { prisma } = await import("@ltex/db");
    (prisma.viewLog.deleteMany as any).mockResolvedValue({ count: 5 });

    const { POST } = await import("./route");
    const req = new NextRequest(
      "http://test.local/api/cron/cleanup-viewlog?days=60",
      {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}` },
      },
    );
    const res = await POST(req);
    const body = await res.json();
    expect(body.days).toBe(60);
  });
});
```

### 3. Startup validation

**`apps/store/instrumentation.ts`** — додати warn якщо `CRON_SECRET` відсутній:

```typescript
// у register():
if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) {
  console.warn(
    "[startup] CRON_SECRET missing or too short — /api/cron/* endpoints disabled",
  );
}
```

(НЕ throw — startup must succeed навіть без cron, бо deploy.ps1 не set-ує цю env. User додає через `apps/store/.env` після deploy.)

### 4. Documentation

**`docs/CRON_SETUP.md`** (new) — як налаштувати Windows Scheduled Task:

````markdown
# Cron Setup (ViewLog Cleanup)

`/api/cron/cleanup-viewlog` потребує:

1. `CRON_SECRET` у `apps/store/.env` (мінімум 16 символів). Згенерувати:
   ```powershell
   [System.Web.Security.Membership]::GeneratePassword(32, 5)
   ```
````

2. Windows Scheduled Task що виконує POST щоночі (03:30):
   - Trigger: Daily, 03:30
   - Action: `powershell.exe`
   - Arguments:
     ```
     -Command "Invoke-WebRequest -Uri 'http://localhost:3000/api/cron/cleanup-viewlog' -Method POST -Headers @{Authorization='Bearer YOUR_SECRET'} -UseBasicParsing"
     ```

Verification:

```powershell
curl -Method POST -Uri "http://localhost:3000/api/cron/cleanup-viewlog" `
  -Headers @{Authorization="Bearer YOUR_SECRET"} -UseBasicParsing
# Expect: { deleted: 0, cutoff: "...", days: 90 }
```

```

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ ≥274 (271 + 3)
4. `deploy.ps1` ASCII-only ✅

---

## Out-of-scope

- Soft-delete (немає `deletedAt` у schema, не варто додавати тільки для cleanup)
- Auto-trigger через Vercel cron (self-hosted на Windows — Scheduled Task)
- Cleanup для інших tables (Notification, ChatMessage retention — окремий follow-up)
- Аналітика/архівування deleted entries (просто drop)
- DB-side TTL (PostgreSQL не має native TTL like MongoDB)

---

## Branch + commit + push

Branch: `claude/session-49-viewlog-cleanup`
Commit: `feat(s49): /api/cron/cleanup-viewlog endpoint + Windows Scheduled Task docs`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Прямий `deploy.ps1`. Після deploy — user-side setup:
1. Додати `CRON_SECRET` у `apps/store/.env` на сервері
2. Створити Windows Scheduled Task per `docs/CRON_SETUP.md`

Якщо CRON_SECRET відсутній — endpoint завжди повертає 401, runtime безпечний.
```
