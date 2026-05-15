import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SyncConfig } from "../config";
import { createPaymentMock } from "../soap/mock";
import { createPaymentViaSoap } from "../soap/client";
import type { IdempotencyStore } from "../idempotency";
import type { PaymentCreateResult } from "../soap/types";

const bodySchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  payload: z.record(z.unknown()),
});

export interface SyncPaymentsDeps {
  config: SyncConfig;
  cache: IdempotencyStore;
}

export function buildSyncPaymentsRoute(
  deps: SyncPaymentsDeps,
): FastifyPluginAsync {
  return async function syncPaymentsRoute(app: FastifyInstance): Promise<void> {
    app.post<{
      Params: { id: string };
      Body: unknown;
    }>("/payments/:id", async (req, reply) => {
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
        return cached as PaymentCreateResult;
      }

      let result: PaymentCreateResult;
      try {
        if (deps.config.mockMode) {
          result = await createPaymentMock({ idempotencyKey, payload });
        } else {
          result = await createPaymentViaSoap(
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
