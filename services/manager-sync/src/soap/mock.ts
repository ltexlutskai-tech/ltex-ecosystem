import type {
  ClientUpdateRequest,
  ClientUpdateResult,
  OrderCreateRequest,
  OrderCreateResult,
  PaymentCreateRequest,
  PaymentCreateResult,
} from "./types";

/**
 * Mock SOAP shim: симулює delay 100-500ms, повертає synthetic ok response.
 * Used коли SYNC_MOCK_MODE=true (default) і у unit tests.
 *
 * Якщо payload.code1C відсутній — генерує синтетичний "MOCK-<ts>" code,
 * mimicking 1С generating код при створенні нового елементу.
 */
export async function updateClientMock(
  req: ClientUpdateRequest,
  options: {
    sleepFn?: (ms: number) => Promise<void>;
    minMs?: number;
    maxMs?: number;
  } = {},
): Promise<ClientUpdateResult> {
  const sleep =
    options.sleepFn ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const minMs = options.minMs ?? 100;
  const maxMs = options.maxMs ?? 500;

  const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await sleep(delay);

  const payloadCode = req.payload["code1C"];
  const code1C =
    typeof payloadCode === "string" && payloadCode.length > 0
      ? payloadCode
      : `MOCK-${Date.now()}`;

  return {
    ok: true,
    code1C,
    mockMode: true,
    errors: [],
  };
}

interface DelayOptions {
  sleepFn?: (ms: number) => Promise<void>;
  minMs?: number;
  maxMs?: number;
}

async function simulateDelay(options: DelayOptions): Promise<void> {
  const sleep =
    options.sleepFn ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const minMs = options.minMs ?? 100;
  const maxMs = options.maxMs ?? 500;
  const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));
  await sleep(delay);
}

/**
 * Mock SOAP shim для `СтворитиЗамовлення` operation. Симулює delay,
 * повертає synthetic `orderCode1C` = "MOCK-ORD-<ts>" + `orderNumber`.
 * Used коли SYNC_MOCK_MODE=true (default).
 */
export async function createOrderMock(
  req: OrderCreateRequest,
  options: DelayOptions = {},
): Promise<OrderCreateResult> {
  await simulateDelay(options);

  const existing = req.payload["code1C"];
  const orderCode1C =
    typeof existing === "string" && existing.length > 0
      ? existing
      : `MOCK-ORD-${Date.now()}`;

  return {
    ok: true,
    orderCode1C,
    orderNumber: `L-MOCK-${Date.now()}`,
    mockMode: true,
    errors: [],
  };
}

/**
 * Mock SOAP shim для `СтворитиОплату` operation. Симулює delay,
 * повертає synthetic `paymentCode1C` = "MOCK-PMT-<ts>".
 */
export async function createPaymentMock(
  req: PaymentCreateRequest,
  options: DelayOptions = {},
): Promise<PaymentCreateResult> {
  await simulateDelay(options);

  return {
    ok: true,
    paymentCode1C: `MOCK-PMT-${Date.now()}`,
    mockMode: true,
    errors: [],
  };
}
