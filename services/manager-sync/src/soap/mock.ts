import type { ClientUpdateRequest, ClientUpdateResult } from "./types";

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
