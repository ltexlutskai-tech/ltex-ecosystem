import { prisma } from "@ltex/db";

/**
 * Orchestrator для INBOUND polling (Етап 3 master-плану
 * `docs/1C_INTEGRATION_PLAN.md`).
 *
 * Викликається з cron `/api/cron/pull-from-1c` (періодичність ~5хв).
 *
 * Flow:
 *  1. Прочитати збережений курсор `last_sync_cursor` з `mgr_sync_state`.
 *  2. POST на `services/manager-sync/pull/snapshot` з `{ cursor }`.
 *  3. Розпакувати snapshot.data і батчити по 50 у відповідні
 *     inbound endpoints (`/api/sync/categories`, `.../products`,
 *     `.../prices`, `.../orders/import`).
 *  4. Зсунути курсор тільки якщо ВСІ endpoint-и пройшли (at-least-once
 *     delivery; повтор — наступним cron-ом).
 *
 * НЕ робить retry-ів усередині — cron сам викликається періодично.
 * Логіку валідації shape-ів лишаємо на inbound endpoints (вони мають
 * Zod-схеми і повертають detail-помилок).
 */

const CURSOR_KEY = "last_sync_cursor";
const BATCH_SIZE = 50;
const PROXY_TIMEOUT_MS = 60_000;
const ENDPOINT_TIMEOUT_MS = 30_000;

export interface PullRunSuccess {
  ok: true;
  cursorAdvanced: boolean;
  oldCursor: string | null;
  newCursor: string;
  totals: {
    categories: { received: number; sent: number };
    products: { received: number; sent: number };
    prices: { received: number; sent: number };
    orders: { received: number; sent: number };
  };
  errors: string[];
}

export interface PullRunFailure {
  ok: false;
  status: "soap_failed" | "bsl_error" | "exception";
  errorCode?: string;
  errorMessage: string;
  oldCursor: string | null;
}

export type PullRunResult = PullRunSuccess | PullRunFailure;

interface ProxySnapshotResponse {
  ok?: boolean;
  syncCursor?: string | null;
  data?: {
    categories?: unknown[];
    products?: unknown[];
    prices?: unknown[];
    orders?: unknown[];
  } | null;
  error?: { code?: string; message?: string } | null;
  errorMessage?: string;
}

export interface RunPullOptions {
  fetchImpl?: typeof fetch;
  proxyUrl?: string;
  sharedSecret?: string;
  storeBaseUrl?: string;
  syncApiKey?: string;
  /** За замовчуванням використовуються наші 4 наявні /api/sync/* endpoints. */
  endpointPaths?: {
    categories: string;
    products: string;
    prices: string;
    orders: string;
  };
}

const DEFAULT_ENDPOINTS = {
  categories: "/api/sync/categories",
  products: "/api/sync/products",
  prices: "/api/sync/prices",
  orders: "/api/sync/orders/import",
} as const;

function getProxyUrl(): string {
  return process.env.MANAGER_SYNC_URL ?? "http://localhost:3001";
}

function getSharedSecret(): string {
  return process.env.MANAGER_SYNC_SHARED_SECRET ?? "";
}

function getStoreBaseUrl(): string {
  // Inbound endpoints живуть в нашому ж Next.js. У продакшені звертаємось
  // через localhost щоб обійти Cloudflare + WAF (швидше і безпечніше).
  return process.env.STORE_INTERNAL_URL ?? "http://localhost:3000";
}

function getSyncApiKey(): string {
  return process.env.SYNC_API_KEY ?? "";
}

export async function runPullFromOnec(
  options: RunPullOptions = {},
): Promise<PullRunResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const proxyUrl = options.proxyUrl ?? getProxyUrl();
  const sharedSecret = options.sharedSecret ?? getSharedSecret();
  const storeBaseUrl = options.storeBaseUrl ?? getStoreBaseUrl();
  const syncApiKey = options.syncApiKey ?? getSyncApiKey();
  const endpoints = options.endpointPaths ?? DEFAULT_ENDPOINTS;

  if (!sharedSecret) {
    return {
      ok: false,
      status: "exception",
      errorMessage: "MANAGER_SYNC_SHARED_SECRET не задана",
      oldCursor: null,
    };
  }
  if (!syncApiKey) {
    return {
      ok: false,
      status: "exception",
      errorMessage: "SYNC_API_KEY не задана",
      oldCursor: null,
    };
  }

  // 1. Прочитати збережений курсор (може не існувати — перший запуск).
  const cursorRow = await prisma.mgrSyncState.findUnique({
    where: { key: CURSOR_KEY },
  });
  const oldCursor = cursorRow?.value ?? null;

  // 2. POST до manager-sync proxy.
  const proxyResp = await callProxySnapshot({
    fetchImpl,
    url: `${proxyUrl}/pull/snapshot`,
    sharedSecret,
    cursor: oldCursor,
  });

  if (!proxyResp.ok) {
    return {
      ok: false,
      status: "soap_failed",
      errorMessage:
        proxyResp.errorMessage ?? "manager-sync proxy: невідома помилка",
      oldCursor,
    };
  }

  if (proxyResp.body.ok === false) {
    return {
      ok: false,
      status: "bsl_error",
      errorCode: proxyResp.body.error?.code,
      errorMessage:
        proxyResp.body.error?.message ?? "BSL повернув ok:false без message",
      oldCursor,
    };
  }

  const newCursor =
    typeof proxyResp.body.syncCursor === "string" &&
    proxyResp.body.syncCursor.length > 0
      ? proxyResp.body.syncCursor
      : null;
  if (!newCursor) {
    return {
      ok: false,
      status: "bsl_error",
      errorMessage: "snapshot success але syncCursor пустий",
      oldCursor,
    };
  }

  const data = proxyResp.body.data ?? {};
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const products = Array.isArray(data.products) ? data.products : [];
  const prices = Array.isArray(data.prices) ? data.prices : [];
  const orders = Array.isArray(data.orders) ? data.orders : [];

  // 3. Форвардити батчами. Кожна група незалежна; якщо одна впала —
  // інші все одно йдуть (логуємо помилки, але cursor не зсунемо).
  const errors: string[] = [];

  const catResult = await forwardBatched({
    fetchImpl,
    url: `${storeBaseUrl}${endpoints.categories}`,
    apiKey: syncApiKey,
    label: "categories",
    items: categories,
    errors,
  });

  const prodResult = await forwardBatched({
    fetchImpl,
    url: `${storeBaseUrl}${endpoints.products}`,
    apiKey: syncApiKey,
    label: "products",
    items: products,
    errors,
  });

  const priceResult = await forwardBatched({
    fetchImpl,
    url: `${storeBaseUrl}${endpoints.prices}`,
    apiKey: syncApiKey,
    label: "prices",
    items: prices,
    errors,
  });

  const ordResult = await forwardBatched({
    fetchImpl,
    url: `${storeBaseUrl}${endpoints.orders}`,
    apiKey: syncApiKey,
    label: "orders",
    items: orders,
    errors,
  });

  const allOk =
    catResult.allOk && prodResult.allOk && priceResult.allOk && ordResult.allOk;

  // 4. Зсунути курсор тільки коли ВСЕ успішно.
  if (allOk) {
    await prisma.mgrSyncState.upsert({
      where: { key: CURSOR_KEY },
      create: { key: CURSOR_KEY, value: newCursor },
      update: { value: newCursor },
    });
  }

  return {
    ok: true,
    cursorAdvanced: allOk,
    oldCursor,
    newCursor,
    totals: {
      categories: { received: categories.length, sent: catResult.sent },
      products: { received: products.length, sent: prodResult.sent },
      prices: { received: prices.length, sent: priceResult.sent },
      orders: { received: orders.length, sent: ordResult.sent },
    },
    errors,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

interface CallProxyParams {
  fetchImpl: typeof fetch;
  url: string;
  sharedSecret: string;
  cursor: string | null;
}

interface CallProxyResult {
  ok: boolean;
  body: ProxySnapshotResponse;
  errorMessage?: string;
}

async function callProxySnapshot(p: CallProxyParams): Promise<CallProxyResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await p.fetchImpl(p.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Secret": p.sharedSecret,
      },
      body: JSON.stringify(p.cursor ? { cursor: p.cursor } : {}),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await safeReadText(res);
      return {
        ok: false,
        body: { ok: false } as ProxySnapshotResponse,
        errorMessage: `Proxy ${res.status}: ${text}`,
      };
    }

    let parsed: ProxySnapshotResponse;
    try {
      parsed = (await res.json()) as ProxySnapshotResponse;
    } catch (err) {
      return {
        ok: false,
        body: { ok: false } as ProxySnapshotResponse,
        errorMessage: `Proxy: invalid JSON: ${(err as Error).message}`,
      };
    }
    return { ok: true, body: parsed };
  } catch (err) {
    return {
      ok: false,
      body: { ok: false } as ProxySnapshotResponse,
      errorMessage: (err as Error)?.message ?? String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ForwardBatchedParams {
  fetchImpl: typeof fetch;
  url: string;
  apiKey: string;
  label: string;
  items: unknown[];
  errors: string[];
}

interface ForwardBatchedResult {
  allOk: boolean;
  sent: number;
}

async function forwardBatched(
  p: ForwardBatchedParams,
): Promise<ForwardBatchedResult> {
  if (p.items.length === 0) return { allOk: true, sent: 0 };

  let allOk = true;
  let sent = 0;

  for (let i = 0; i < p.items.length; i += BATCH_SIZE) {
    const batch = p.items.slice(i, i + BATCH_SIZE);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENDPOINT_TIMEOUT_MS);
    try {
      const res = await p.fetchImpl(p.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify(batch),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await safeReadText(res);
        p.errors.push(
          `${p.label} batch ${i / BATCH_SIZE + 1}: HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
        allOk = false;
        continue;
      }
      sent += batch.length;
    } catch (err) {
      p.errors.push(
        `${p.label} batch ${i / BATCH_SIZE + 1}: ${(err as Error)?.message ?? String(err)}`,
      );
      allOk = false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return { allOk, sent };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
