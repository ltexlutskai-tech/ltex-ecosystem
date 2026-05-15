import type { FastifyReply, FastifyRequest } from "fastify";
import type { SyncConfig } from "./config";

/**
 * Перевіряє X-Sync-Secret header проти shared secret. /health доступний
 * без auth — щоб PM2/uptime могли пінгувати без вмонтованого секрета.
 */
export function createAuthMiddleware(config: SyncConfig) {
  return async function authMiddleware(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (req.url === "/health") return;

    const headerRaw = req.headers["x-sync-secret"];
    const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;

    if (!header || header !== config.sharedSecret) {
      reply.code(401).send({ error: "Unauthorized" });
    }
  };
}
