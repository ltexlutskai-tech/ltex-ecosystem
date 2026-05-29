/**
 * M3.4 Closures — mock SOAP shims (used коли SYNC_MOCK_MODE=true / unit tests).
 *
 * Симулюють минимальний "happy path" для UI dev:
 *  - GET: повертає 3 fake позиції (1 фактично продано повністю → "green");
 *  - POST: повертає `closedCount=items.length` + (якщо є addToNewOrder)
 *          синтетичний `newOrderNumber/newOrderUid`.
 */

import type {
  ClosuresCloseRequest,
  ClosuresCloseResult,
  ClosuresGetRequest,
  ClosuresGetResult,
} from "./closures-types";

interface DelayOptions {
  sleepFn?: (ms: number) => Promise<void>;
  minMs?: number;
  maxMs?: number;
}

async function simulateDelay(options: DelayOptions): Promise<void> {
  const sleep =
    options.sleepFn ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const minMs = options.minMs ?? 50;
  const maxMs = options.maxMs ?? 200;
  const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await sleep(delay);
}

export async function getClosuresMock(
  req: ClosuresGetRequest,
  options: DelayOptions = {},
): Promise<ClosuresGetResult> {
  await simulateDelay(options);

  // Простий стабільний синтетичний набір (3 рядки) — досить для UI smoke.
  const cc = req.clientCode1C;
  return {
    ok: true,
    mockMode: true,
    items: [
      {
        orderUid: `mock-order-${cc}-001`,
        orderNumber: `L-MOCK-${cc}-001`,
        orderDate: "2026-04-15T00:00:00",
        productUid: "mock-product-001",
        productName: "L.AS Adult Mix UK [MOCK]",
        quantity: 100,
        sum: 5000,
        sold: 25,
        status: "Новий",
      },
      {
        orderUid: `mock-order-${cc}-002`,
        orderNumber: `L-MOCK-${cc}-002`,
        orderDate: "2026-04-20T00:00:00",
        productUid: "mock-product-002",
        productName: "L.AS Kids Mix UK [MOCK]",
        quantity: 50,
        sum: 2500,
        sold: 50, // повністю продано → у UI зелений
        status: "Виконаний",
      },
      {
        orderUid: `mock-order-${cc}-003`,
        orderNumber: `L-MOCK-${cc}-003`,
        orderDate: "2026-05-01T00:00:00",
        productUid: "mock-product-003",
        productName: "L.SH Sneakers Mix DE [MOCK]",
        quantity: 30,
        sum: 1500,
        sold: 0,
        status: "Новий",
      },
    ],
  };
}

export async function closeClosuresMock(
  req: ClosuresCloseRequest,
  options: DelayOptions = {},
): Promise<ClosuresCloseResult> {
  await simulateDelay(options);

  const willCreateNew = req.items.some((i) => i.addToNewOrder === true);
  const newOrderUid = willCreateNew ? `mock-new-order-${Date.now()}` : null;
  const newOrderNumber = willCreateNew ? `L-MOCK-NEW-${Date.now()}` : null;

  return {
    ok: true,
    mockMode: true,
    alreadyProcessed: false,
    closedCount: req.items.length,
    newOrderUid,
    newOrderNumber,
  };
}
