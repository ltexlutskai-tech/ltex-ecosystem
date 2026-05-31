import { z } from "zod";

const envSchema = z.object({
  MANAGER_SYNC_PORT: z
    .string()
    .default("3001")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n > 0 && n < 65536, {
      message: "MANAGER_SYNC_PORT must be a valid port number",
    }),
  MANAGER_SYNC_SHARED_SECRET: z
    .string()
    .min(16, "MANAGER_SYNC_SHARED_SECRET must be ≥16 chars"),
  SYNC_MOCK_MODE: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  ONEC_SOAP_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ONEC_SOAP_PASSWORD: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // HTTP Basic auth для Apache→1C (1С користувач, напр. `Тарас`).
  // Окремо від ONEC_SOAP_PASSWORD (sync password у JSON).
  ONEC_HTTP_USER: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ONEC_HTTP_PASSWORD: z
    .string()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  ONEC_SOAP_TIMEOUT_MS: z
    .string()
    .default("30000")
    .transform((v) => Number.parseInt(v, 10))
    .refine((n) => Number.isFinite(n) && n > 0, {
      message: "ONEC_SOAP_TIMEOUT_MS must be a positive integer",
    }),
});

export interface SyncConfig {
  port: number;
  sharedSecret: string;
  mockMode: boolean;
  onecUrl: string | undefined;
  onecPassword: string | undefined;
  onecHttpUser: string | undefined;
  onecHttpPassword: string | undefined;
  onecTimeoutMs: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const parsed = envSchema.parse(env);
  if (
    !parsed.SYNC_MOCK_MODE &&
    (!parsed.ONEC_SOAP_URL || !parsed.ONEC_SOAP_PASSWORD)
  ) {
    throw new Error(
      "When SYNC_MOCK_MODE=false, ONEC_SOAP_URL and ONEC_SOAP_PASSWORD must be set",
    );
  }
  return {
    port: parsed.MANAGER_SYNC_PORT,
    sharedSecret: parsed.MANAGER_SYNC_SHARED_SECRET,
    mockMode: parsed.SYNC_MOCK_MODE,
    onecUrl: parsed.ONEC_SOAP_URL,
    onecPassword: parsed.ONEC_SOAP_PASSWORD,
    onecHttpUser: parsed.ONEC_HTTP_USER,
    onecHttpPassword: parsed.ONEC_HTTP_PASSWORD,
    onecTimeoutMs: parsed.ONEC_SOAP_TIMEOUT_MS,
  };
}

// Lazy lookup так — щоб тести могли підставити свої env vars до load
let cached: SyncConfig | null = null;
export function getConfig(): SyncConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

export function resetConfigForTests(): void {
  cached = null;
}
