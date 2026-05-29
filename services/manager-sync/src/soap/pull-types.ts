/**
 * Shared types для pull-mode (INBOUND polling, Етап 3).
 *
 * Структура `snapshot` повторює JSON-контракт BSL-функції
 * `СформуватиПакетДаннихJSON` (див. `docs/1c-bsl/inbound/Module.bsl.append`).
 *
 * `data.*` масиви типізовані як `unknown[]` — реальна Zod-валідація
 * відбувається на нашій Next.js-стороні усередині існуючих
 * `/api/sync/*` endpoints. Тут (у proxy) ми лише форвардимо.
 */

export interface PullSnapshotRequest {
  /** ISO timestamp останнього успішного pull. Пустий = повний дамп. */
  cursor?: string;
}

export interface PullSnapshotData {
  categories: unknown[];
  products: unknown[];
  prices: unknown[];
  orders: unknown[];
}

export interface PullSnapshotSuccess {
  ok: true;
  /** Новий курсор — caller збереже як `last_sync_cursor` у `mgr_sync_state`. */
  syncCursor: string;
  data: PullSnapshotData;
  mockMode?: boolean;
  error?: null;
}

export interface PullSnapshotError {
  ok: false;
  syncCursor: null;
  data: null;
  error: {
    code: string;
    message: string;
  };
  mockMode?: boolean;
}

export type PullSnapshotResult = PullSnapshotSuccess | PullSnapshotError;
