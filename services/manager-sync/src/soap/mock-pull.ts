import type { PullSnapshotRequest, PullSnapshotResult } from "./pull-types";

/**
 * Mock pull-snapshot shim: симулює delay і повертає **порожній** snapshot з
 * новим cursor-ом. Used коли SYNC_MOCK_MODE=true (default).
 *
 * Hard rule: ніколи не throw-ить (повертає `ok: true` з пустими масивами),
 * щоб CI/dev не падав на відсутньому 1С.
 *
 * `cursor` echo НЕ потрібен — caller і так не використовує старе значення
 * (зберігає тільки нове). Тестам важливо що cursor — валідний ISO-string
 * і що передані input-и не змінюють поведінки (mock idempotent).
 */
export async function pullSnapshotMock(
  req: PullSnapshotRequest,
  options: {
    sleepFn?: (ms: number) => Promise<void>;
    minMs?: number;
    maxMs?: number;
    now?: () => Date;
  } = {},
): Promise<PullSnapshotResult> {
  // Cursor був чи ні — для mock-у байдуже; це підкреслено навмисно
  // (повертаємо однаковий результат). Реальний 1С розрізняв би.
  void req.cursor;

  const sleep =
    options.sleepFn ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const minMs = options.minMs ?? 10;
  const maxMs = options.maxMs ?? 50;
  const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await sleep(delay);

  const now = options.now ? options.now() : new Date();
  return {
    ok: true,
    syncCursor: now.toISOString(),
    data: {
      categories: [],
      products: [],
      prices: [],
      orders: [],
    },
    mockMode: true,
    error: null,
  };
}
