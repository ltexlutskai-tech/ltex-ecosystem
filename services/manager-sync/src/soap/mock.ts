import type {
  CashOrderCreateRequest,
  CashOrderCreateResult,
  ClientUpdateRequest,
  ClientUpdateResult,
  OrderCreateRequest,
  OrderCreateResult,
  PaymentCreateRequest,
  PaymentCreateResult,
  RealizationCreateRequest,
  RealizationCreateResult,
  RouteSheetCreateRequest,
  RouteSheetCreateResult,
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

/**
 * Mock SOAP shim для `СтворитиРеалізацію` operation. Симулює delay,
 * повертає synthetic `realizationCode1C` = "MOCK-RLZ-<ts>" + `realizationNumber`.
 * Used коли SYNC_MOCK_MODE=true (default).
 */
export async function createRealizationMock(
  req: RealizationCreateRequest,
  options: DelayOptions = {},
): Promise<RealizationCreateResult> {
  await simulateDelay(options);

  const existing = req.payload["code1C"];
  const realizationCode1C =
    typeof existing === "string" && existing.length > 0
      ? existing
      : `MOCK-RLZ-${Date.now()}`;

  return {
    ok: true,
    realizationCode1C,
    realizationNumber: `R-MOCK-${Date.now()}`,
    mockMode: true,
    errors: [],
  };
}

/**
 * Mock SOAP shim для `СоздатьПКО` operation (касовий ордер). Симулює delay,
 * повертає synthetic `cashOrderCode1C` = "MOCK-PKO-<ts>" (echoes existing
 * payload.code1C коли є). Used коли SYNC_MOCK_MODE=true (default).
 */
export async function createCashOrderMock(
  req: CashOrderCreateRequest,
  options: DelayOptions = {},
): Promise<CashOrderCreateResult> {
  await simulateDelay(options);

  const existing = req.payload["code1C"];
  const cashOrderCode1C =
    typeof existing === "string" && existing.length > 0
      ? existing
      : `MOCK-PKO-${Date.now()}`;

  return {
    ok: true,
    cashOrderCode1C,
    mockMode: true,
    errors: [],
  };
}

/**
 * Mock SOAP shim для `СтворитиМаршрутнийЛист` operation. Симулює delay,
 * повертає synthetic `routeSheetCode1C` = "MOCK-RSH-<ts>" + `routeSheetNumber`
 * (echoes existing payload.code1C коли є). Used коли SYNC_MOCK_MODE=true (default).
 */
export async function createRouteSheetMock(
  req: RouteSheetCreateRequest,
  options: DelayOptions = {},
): Promise<RouteSheetCreateResult> {
  await simulateDelay(options);

  const existing = req.payload["code1C"];
  const routeSheetCode1C =
    typeof existing === "string" && existing.length > 0
      ? existing
      : `MOCK-RSH-${Date.now()}`;

  return {
    ok: true,
    routeSheetCode1C,
    routeSheetNumber: `ML-MOCK-${Date.now()}`,
    mockMode: true,
    errors: [],
  };
}
