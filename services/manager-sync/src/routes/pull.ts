import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SyncConfig } from "../config";
import { pullSnapshotMock } from "../soap/mock-pull";
import { pullSnapshotViaSoap } from "../soap/pull-client";
import type { PullSnapshotResult } from "../soap/pull-types";

/**
 * POST /pull/snapshot — INBOUND polling (Етап 3).
 *
 * Body: `{ cursor?: string }`. `cursor` — ISO timestamp останнього
 * успішного pull-у; пустий або відсутній = повний дамп.
 *
 * У mock-mode (default у CI/dev) — повертає порожній snapshot з новим
 * cursor-ом без виклику 1С. У production — кличе SOAP-операцію
 * `СформуватиПакетДаннихJSON` (BSL у `docs/1c-bsl/inbound/Module.bsl.append`).
 */

const bodySchema = z.object({
  cursor: z.string().min(1).max(64).optional(),
});

export interface SyncPullDeps {
  config: SyncConfig;
}

export function buildSyncPullRoute(deps: SyncPullDeps): FastifyPluginAsync {
  return async function syncPullRoute(app: FastifyInstance): Promise<void> {
    app.post<{ Body: unknown }>("/pull/snapshot", async (req, reply) => {
      const parsed = bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({
          ok: false,
          error: "Invalid body",
          issues: parsed.error.issues.slice(0, 5),
        });
        return;
      }
      const cursor = parsed.data.cursor;

      let result: PullSnapshotResult;
      try {
        if (deps.config.mockMode) {
          result = await pullSnapshotMock({ cursor });
        } else {
          result = await pullSnapshotViaSoap({ cursor }, deps.config);
        }
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        reply.code(502).send({ ok: false, errorMessage: message });
        return;
      }

      return result;
    });
  };
}
