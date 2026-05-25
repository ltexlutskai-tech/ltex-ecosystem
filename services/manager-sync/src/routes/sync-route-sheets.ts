import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SyncConfig } from "../config";
import { createRouteSheetMock } from "../soap/mock";
import { createRouteSheetViaSoap } from "../soap/client";
import type { IdempotencyStore } from "../idempotency";
import type { RouteSheetCreateResult } from "../soap/types";

const bodySchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  payload: z.record(z.unknown()),
});

export interface SyncRouteSheetsDeps {
  config: SyncConfig;
  cache: IdempotencyStore;
}

export function buildSyncRouteSheetsRoute(
  deps: SyncRouteSheetsDeps,
): FastifyPluginAsync {
  return async function syncRouteSheetsRoute(
    app: FastifyInstance,
  ): Promise<void> {
    app.post<{
      Params: { id: string };
      Body: unknown;
    }>("/route-sheets/:id", async (req, reply) => {
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
        return cached as RouteSheetCreateResult;
      }

      let result: RouteSheetCreateResult;
      try {
        if (deps.config.mockMode) {
          result = await createRouteSheetMock({ idempotencyKey, payload });
        } else {
          result = await createRouteSheetViaSoap(
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
