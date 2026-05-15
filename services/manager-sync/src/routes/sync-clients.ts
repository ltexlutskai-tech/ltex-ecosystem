import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SyncConfig } from "../config";
import { updateClientMock } from "../soap/mock";
import { updateClientViaSoap } from "../soap/client";
import type { IdempotencyStore } from "../idempotency";
import type { ClientUpdateResult } from "../soap/types";

const bodySchema = z.object({
  idempotencyKey: z
    .string()
    .min(1)
    // Не примусово UUID — 1С приймає будь-який стабільний string.
    .max(128),
  payload: z.record(z.unknown()),
});

export interface SyncClientsDeps {
  config: SyncConfig;
  cache: IdempotencyStore;
}

export function buildSyncClientsRoute(
  deps: SyncClientsDeps,
): FastifyPluginAsync {
  return async function syncClientsRoute(app: FastifyInstance): Promise<void> {
    app.post<{
      Params: { id: string };
      Body: unknown;
    }>("/clients/:id", async (req, reply) => {
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
        return cached as ClientUpdateResult;
      }

      let result: ClientUpdateResult;
      try {
        if (deps.config.mockMode) {
          result = await updateClientMock({ idempotencyKey, payload });
        } else {
          result = await updateClientViaSoap(
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
