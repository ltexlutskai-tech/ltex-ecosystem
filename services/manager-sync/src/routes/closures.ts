/**
 * M3.4 Closures — Fastify routes для manager-sync proxy:
 *
 *   GET  /sync/closures/get-data/:clientCode1C   — список незакритих замовлень
 *   POST /sync/closures/close                    — закриває + опц. створює новий
 *
 * Auth — той самий X-Sync-Secret як інші routes (через `createAuthMiddleware`).
 * Mock-mode (default) маршрутить у `closures-mock.ts`; real-mode у
 * `closures-client.ts` (SOAP до 1С).
 */

import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SyncConfig } from "../config";
import type { IdempotencyStore } from "../idempotency";
import { getClosuresMock, closeClosuresMock } from "../soap/closures-mock";
import {
  getClosuresViaSoap,
  closeClosuresViaSoap,
} from "../soap/closures-client";
import type {
  ClosuresCloseResult,
  ClosuresGetResult,
} from "../soap/closures-types";

const closeBodySchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  clientCode1C: z.string().min(1).max(64),
  items: z
    .array(
      z.object({
        orderUid: z.string().min(1),
        productUid: z.string().min(1),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
        addToNewOrder: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
});

export interface SyncClosuresDeps {
  config: SyncConfig;
  cache: IdempotencyStore;
}

export function buildSyncClosuresRoute(
  deps: SyncClosuresDeps,
): FastifyPluginAsync {
  return async function syncClosuresRoute(app: FastifyInstance): Promise<void> {
    // GET — параметри у URL (clientCode1C обов'язковий; idempotencyKey
    // підставимо штучний бо READ — idempotent за визначенням).
    app.get<{ Params: { clientCode1C: string } }>(
      "/closures/get-data/:clientCode1C",
      async (req, reply) => {
        const clientCode1C = req.params.clientCode1C?.trim() ?? "";
        if (!clientCode1C) {
          reply
            .code(400)
            .send({ ok: false, errorMessage: "clientCode1C is required" });
          return;
        }
        const idempotencyKey = `closures-get:${clientCode1C}`;
        const cached = deps.cache.get(idempotencyKey);
        if (cached !== null) {
          reply.header("x-sync-cache", "hit");
          return cached as ClosuresGetResult;
        }
        let result: ClosuresGetResult;
        try {
          if (deps.config.mockMode) {
            result = await getClosuresMock({ idempotencyKey, clientCode1C });
          } else {
            result = await getClosuresViaSoap(
              { idempotencyKey, clientCode1C },
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
      },
    );

    // POST — закрити (+ опц. створити новий заказ).
    app.post<{ Body: unknown }>("/closures/close", async (req, reply) => {
      const parsed = closeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({
          ok: false,
          error: "Invalid body",
          issues: parsed.error.issues.slice(0, 5),
        });
        return;
      }
      const { idempotencyKey, clientCode1C, items } = parsed.data;
      const cached = deps.cache.get(idempotencyKey);
      if (cached !== null) {
        reply.header("x-sync-cache", "hit");
        return cached as ClosuresCloseResult;
      }
      let result: ClosuresCloseResult;
      try {
        if (deps.config.mockMode) {
          result = await closeClosuresMock({
            idempotencyKey,
            clientCode1C,
            items,
          });
        } else {
          result = await closeClosuresViaSoap(
            { idempotencyKey, clientCode1C, items },
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
