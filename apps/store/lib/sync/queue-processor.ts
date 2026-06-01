import { prisma, type MgrSyncJob } from "@ltex/db";
import { sendToProxy } from "./proxy-client";

/**
 * Batch processor for MgrSyncJob черги.
 *
 * Викликається cron-route /api/cron/process-sync-queue кожну ~1 хв.
 * На кожен `pending`/`retrying` job з `nextAttemptAt <= now`:
 *   - sendToProxy() → 200 → status='sent', sentAt=now
 *   - error → attempts++; якщо attempts < maxAttempts → status='retrying'
 *     з backoff schedule; інакше status='failed' з lastError.
 *
 * Backoff schedule mirror-ить email DLQ з S70: 1m / 5m / 30m / 2h / 6h.
 */

const BACKOFF_MS = [
  60_000, // 1m
  5 * 60_000, // 5m
  30 * 60_000, // 30m
  2 * 60 * 60_000, // 2h
  6 * 60 * 60_000, // 6h
];

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  retrying: number;
  failed: number;
}

function backoffMsFor(attemptIndex: number): number {
  if (attemptIndex < 0) return BACKOFF_MS[0] ?? 60_000;
  if (attemptIndex >= BACKOFF_MS.length) {
    return BACKOFF_MS[BACKOFF_MS.length - 1] ?? 6 * 60 * 60_000;
  }
  return BACKOFF_MS[attemptIndex] ?? 60_000;
}

export async function processSyncQueue(
  batchSize = 20,
  options: { now?: () => Date; send?: typeof sendToProxy } = {},
): Promise<ProcessQueueResult> {
  const nowFn = options.now ?? (() => new Date());
  const send = options.send ?? sendToProxy;

  const jobs = await prisma.mgrSyncJob.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      nextAttemptAt: { lte: nowFn() },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: batchSize,
  });

  let sent = 0;
  let retrying = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await send({
        entityType: job.entityType,
        entityId: job.entityId,
        idempotencyKey: job.idempotencyKey,
        payload: job.payload as unknown,
      } as MgrSyncJob);

      // HTTP 200 від manager-sync ще НЕ означає що 1С успішно прийняв запит.
      // BSL може повернути {ok:false, error:{code,message}} при exception
      // у бізнес-логіці (відсутні обов'язкові поля, FK не знайдено тощо).
      // Витягуємо повідомлення помилки і кидаємо як звичайний sync-fail
      // → retry/failed branch нижче.
      if (result && result.ok === false) {
        const errObj =
          result.error && typeof result.error === "object"
            ? (result.error as Record<string, unknown>)
            : null;
        const code = typeof errObj?.code === "string" ? errObj.code : "error";
        const msg =
          typeof errObj?.message === "string"
            ? errObj.message
            : typeof result.errorMessage === "string"
              ? result.errorMessage
              : "Sync failed";
        throw new Error(`1C ${code}: ${msg}`);
      }

      await prisma.mgrSyncJob.update({
        where: { id: job.id },
        data: {
          status: "sent",
          attempts: job.attempts + 1,
          sentAt: nowFn(),
          lastError: null,
        },
      });
      // BSL повертає `code1C` створеного/оновленого Контрагента — пишемо назад
      // у MgrClient щоб UI бачив що клієнт уже у 1С + майбутні sync шли як
      // update а не create.
      if (
        job.entityType === "client" &&
        typeof result?.code1C === "string" &&
        result.code1C.length > 0
      ) {
        await prisma.mgrClient
          .update({
            where: { id: job.entityId },
            data: { code1C: result.code1C, lastSyncedAt: nowFn() },
          })
          .catch((e: unknown) => {
            console.warn("[L-TEX] Failed to backfill code1C", {
              clientId: job.entityId,
              error: e instanceof Error ? e.message : String(e),
            });
          });
      }
      sent++;
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const nextAttempts = job.attempts + 1;
      if (nextAttempts >= job.maxAttempts) {
        await prisma.mgrSyncJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            attempts: nextAttempts,
            lastError: message.slice(0, 2000),
          },
        });
        failed++;
        console.error("[L-TEX] MgrSyncJob exhausted retries", {
          id: job.id,
          entityType: job.entityType,
          entityId: job.entityId,
          attempts: nextAttempts,
        });
      } else {
        const backoff = backoffMsFor(nextAttempts - 1);
        await prisma.mgrSyncJob.update({
          where: { id: job.id },
          data: {
            status: "retrying",
            attempts: nextAttempts,
            nextAttemptAt: new Date(nowFn().getTime() + backoff),
            lastError: message.slice(0, 2000),
          },
        });
        retrying++;
      }
    }
  }

  return { processed: jobs.length, sent, retrying, failed };
}
