/**
 * L-TEX Manager Sync proxy.
 *
 * HTTP service між Next.js (apps/store) і 1С SOAP (`MobileExchange.1cws`).
 *
 * Modes:
 *  - SYNC_MOCK_MODE=true (default) — повертає synthetic responses, корисно
 *    для dev і CI коли 1С недоступний.
 *  - SYNC_MOCK_MODE=false — real SOAP-calls на ONEC_SOAP_URL.
 *
 * Env vars: див. .env.example
 */

import "dotenv/config";

import Fastify from "fastify";
import { loadConfig } from "./config";
import { createAuthMiddleware } from "./auth";
import { idempotencyCache } from "./idempotency";
import { buildSyncClientsRoute } from "./routes/sync-clients";
import { buildSyncOrdersRoute } from "./routes/sync-orders";
import { buildSyncPaymentsRoute } from "./routes/sync-payments";
import { buildSyncRealizationsRoute } from "./routes/sync-realizations";
import { buildSyncCashOrdersRoute } from "./routes/sync-cash-orders";
import { buildSyncRouteSheetsRoute } from "./routes/sync-route-sheets";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = Fastify({ logger: true });

  app.addHook("preHandler", createAuthMiddleware(config));

  app.get("/health", async () => ({
    ok: true,
    mockMode: config.mockMode,
    cacheSize: idempotencyCache.size(),
  }));

  await app.register(
    buildSyncClientsRoute({ config, cache: idempotencyCache }),
    { prefix: "/sync" },
  );

  await app.register(
    buildSyncOrdersRoute({ config, cache: idempotencyCache }),
    { prefix: "/sync" },
  );

  await app.register(
    buildSyncPaymentsRoute({ config, cache: idempotencyCache }),
    { prefix: "/sync" },
  );

  await app.register(
    buildSyncRealizationsRoute({ config, cache: idempotencyCache }),
    { prefix: "/sync" },
  );

  await app.register(
    buildSyncCashOrdersRoute({ config, cache: idempotencyCache }),
    { prefix: "/sync" },
  );

  await app.register(
    buildSyncRouteSheetsRoute({ config, cache: idempotencyCache }),
    { prefix: "/sync" },
  );

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(
    `[manager-sync] listening on :${config.port} mockMode=${config.mockMode}`,
  );
}

main().catch((err: unknown) => {
  console.error("[manager-sync] fatal startup error", err);
  process.exit(1);
});
