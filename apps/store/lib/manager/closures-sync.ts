/**
 * M3.4 Closures — server-side helper для виклику manager-sync proxy.
 *
 * Аналогічно `lib/sync/proxy-client.ts` (queue-processor flow), але БЕЗ
 * прив'язки до `MgrSyncJob`: closures — це synchronous flow (UI чекає
 * відповідь), без черги, без retry-with-backoff. Помилка одразу повертається
 * клієнту як 502.
 */

const PROXY_TIMEOUT_MS = 30_000;

function getProxyUrl(): string {
  return process.env.MANAGER_SYNC_URL ?? "http://localhost:3001";
}

function getSharedSecret(): string {
  return process.env.MANAGER_SYNC_SHARED_SECRET ?? "";
}

export interface ClosuresListItem {
  orderUid: string;
  orderNumber: string;
  orderDate: string;
  productUid: string;
  productName: string;
  quantity: number;
  sum: number;
  sold: number;
  status: string;
}

export interface FetchClosuresResult {
  ok: boolean;
  items: ClosuresListItem[];
  errorMessage?: string;
}

export async function fetchClosuresFromOnec(
  clientCode1C: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchClosuresResult> {
  const url = `${getProxyUrl()}/sync/closures/get-data/${encodeURIComponent(
    clientCode1C,
  )}`;
  const secret = getSharedSecret();
  if (!secret) {
    return {
      ok: false,
      items: [],
      errorMessage: "MANAGER_SYNC_SHARED_SECRET не задана",
    };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { "X-Sync-Secret": secret },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const text = await safeText(res);
    return {
      ok: false,
      items: [],
      errorMessage: `proxy ${res.status}: ${text}`,
    };
  }
  const json = (await res.json()) as {
    ok?: boolean;
    items?: ClosuresListItem[];
    errorMessage?: string;
  };
  if (json.ok === true) {
    return { ok: true, items: Array.isArray(json.items) ? json.items : [] };
  }
  return {
    ok: false,
    items: [],
    errorMessage: json.errorMessage ?? "1С повернув помилку",
  };
}

export interface CloseClosuresItem {
  orderUid: string;
  productUid: string;
  quantity: number;
  price: number;
  addToNewOrder: boolean;
}

export interface CloseClosuresResult {
  ok: boolean;
  closedCount: number;
  newOrderUid: string | null;
  newOrderNumber: string | null;
  alreadyProcessed: boolean;
  errorMessage?: string;
}

export async function closeClosuresViaOnec(
  args: {
    idempotencyKey: string;
    clientCode1C: string;
    items: CloseClosuresItem[];
  },
  fetchImpl: typeof fetch = fetch,
): Promise<CloseClosuresResult> {
  const url = `${getProxyUrl()}/sync/closures/close`;
  const secret = getSharedSecret();
  if (!secret) {
    return {
      ok: false,
      closedCount: 0,
      newOrderUid: null,
      newOrderNumber: null,
      alreadyProcessed: false,
      errorMessage: "MANAGER_SYNC_SHARED_SECRET не задана",
    };
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
      body: JSON.stringify(args),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const text = await safeText(res);
    return {
      ok: false,
      closedCount: 0,
      newOrderUid: null,
      newOrderNumber: null,
      alreadyProcessed: false,
      errorMessage: `proxy ${res.status}: ${text}`,
    };
  }
  const json = (await res.json()) as {
    ok?: boolean;
    closedCount?: number;
    newOrderUid?: string | null;
    newOrderNumber?: string | null;
    alreadyProcessed?: boolean;
    errorMessage?: string;
  };
  if (json.ok === true) {
    return {
      ok: true,
      closedCount: Number(json.closedCount ?? args.items.length),
      newOrderUid: json.newOrderUid ?? null,
      newOrderNumber: json.newOrderNumber ?? null,
      alreadyProcessed: json.alreadyProcessed === true,
    };
  }
  return {
    ok: false,
    closedCount: 0,
    newOrderUid: null,
    newOrderNumber: null,
    alreadyProcessed: false,
    errorMessage: json.errorMessage ?? "1С повернув помилку",
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
