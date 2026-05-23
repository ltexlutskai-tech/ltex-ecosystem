import type { MgrSyncJob } from "@ltex/db";

/**
 * HTTP-клієнт від Next.js queue-processor → services/manager-sync proxy.
 *
 * Proxy expects shared secret у `X-Sync-Secret` header (auth.ts на proxy
 * стороні). Body: `{ idempotencyKey, payload }`.
 *
 * Errors:
 *  - non-2xx → throw Error("Proxy <status>: <body>")
 *  - network/timeout → fetch native throw, передаємо вище
 *
 * **NOT** retry-ить тут — це робить queue-processor з exponential backoff.
 */

const PROXY_TIMEOUT_MS = 30_000;

export interface SendToProxyResult {
  ok: boolean;
  [k: string]: unknown;
}

function getProxyUrl(): string {
  return process.env.MANAGER_SYNC_URL ?? "http://localhost:3001";
}

function getSharedSecret(): string {
  return process.env.MANAGER_SYNC_SHARED_SECRET ?? "";
}

function routeFor(job: Pick<MgrSyncJob, "entityType" | "entityId">): string {
  switch (job.entityType) {
    case "client":
      return `/sync/clients/${job.entityId}`;
    case "order":
      return `/sync/orders/${job.entityId}`;
    case "payment":
      return `/sync/payments/${job.entityId}`;
    case "realization":
      return `/sync/realizations/${job.entityId}`;
    case "cash_order":
      return `/sync/cash-orders/${job.entityId}`;
    default:
      throw new Error(
        `proxy-client: unsupported entityType '${job.entityType}'`,
      );
  }
}

export async function sendToProxy(
  job: Pick<
    MgrSyncJob,
    "entityType" | "entityId" | "idempotencyKey" | "payload"
  >,
  fetchImpl: typeof fetch = fetch,
): Promise<SendToProxyResult> {
  const path = routeFor(job);
  const url = `${getProxyUrl()}${path}`;
  const secret = getSharedSecret();

  if (!secret) {
    throw new Error(
      "proxy-client: MANAGER_SYNC_SHARED_SECRET не задана у env (sync вимкнено)",
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Secret": secret,
      },
      body: JSON.stringify({
        idempotencyKey: job.idempotencyKey,
        payload: job.payload,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let text: string;
    try {
      text = await res.text();
    } catch {
      text = "<no body>";
    }
    throw new Error(`Proxy ${res.status}: ${text}`);
  }

  const json = (await res.json()) as SendToProxyResult;
  return json;
}
