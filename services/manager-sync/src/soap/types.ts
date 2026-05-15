/**
 * Shared types between mock + real SOAP клієнти.
 *
 * `payload` shape — narrow type echoed від enqueueClientUpdate() у Next.js:
 * див. apps/store/lib/validations/sync-job.ts. SOAP-сторона приймає будь-який
 * JSON; ми тут типізуємо для compile-time safety на boundary.
 */
export interface ClientUpdateRequest {
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

export interface ClientUpdateSuccess {
  ok: true;
  code1C: string;
  mockMode?: boolean;
  errors?: string[];
}

export interface ClientUpdateError {
  ok: false;
  errorCode: number;
  errorMessage: string;
  mockMode?: boolean;
}

export type ClientUpdateResult = ClientUpdateSuccess | ClientUpdateError;
