import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SyncConfig } from "../config";
import { createCashOrderMock } from "../soap/mock";
import { createCashOrderViaSoap } from "../soap/client";
import type { IdempotencyStore } from "../idempotency";
import type { CashOrderCreateResult } from "../soap/types";

const bodySchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  payload: z.record(z.unknown()),
});

export interface SyncCashOrdersDeps {
  config: SyncConfig;
  cache: IdempotencyStore;
}

export function buildSyncCashOrdersRoute(
  deps: SyncCashOrdersDeps,
): FastifyPluginAsync {
  return async function syncCashOrdersRoute(
    app: FastifyInstance,
  ): Promise<void> {
    app.post<{
      Params: { id: string };
      Body: unknown;
    }>("/cash-orders/:id", async (req, reply) => {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({
          ok: false,
          error: "Invalid body",
          issues: parsed.error.issues.slice(0, 5),
        });
        return;
      }
      const { idempotencyKey, payload } = parsed.data;

      const cached = deps.cache.get(idempotencyKey);
      if (cached !== null) {
        reply.header("x-sync-cache", "hit");
        return cached as CashOrderCreateResult;
      }

      let result: CashOrderCreateResult;
      try {
        if (deps.config.mockMode) {
          result = await createCashOrderMock({ idempotencyKey, payload });
        } else {
          result = await createCashOrderViaSoap(
            { idempotencyKey, payload },
            deps.config,
          );
        }
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        reply.code(502).send({ ok: false, errorMessage: message });
        return;
      }

      deps.cache.set(idempotencyKey, result);
      reply.header("x-sync-cache", "miss");
      return result;
    });
  };
}
