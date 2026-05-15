import { z } from "zod";

/**
 * Zod schemas для MgrSyncJob payloads.
 *
 * `clientUpdatePayloadSchema` — shape що letiTь до 1С `ОбновитиКлієнта`.
 * Усі numeric/Decimal поля передаються як string з `.` decimal separator
 * щоб уникнути floating-point issues (1С парсить через Число()).
 * Усі optional поля — nullable; empty string → null нормалізується перед serialize.
 *
 * SyncJob `payload` JSONB column — фактично "any object". Цей schema —
 * один з shapes що ми використовуємо (наразі тільки `client`-entityType).
 */

export const clientUpdatePayloadSchema = z
  .object({
    code1C: z.string().nullable().optional(),
    name: z.string().min(1),
    tradePointName: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    street: z.string().nullable().optional(),
    house: z.string().nullable().optional(),
    novaPoshtaBranch: z.string().nullable().optional(),
    websiteUrl: z.string().nullable().optional(),
    geolocation: z.string().nullable().optional(),
    monthlyVolume: z.string().nullable().optional(),
    licenseExpiresAt: z.string().nullable().optional(),
    viberContact: z.string().nullable().optional(),
    dialogStatus: z.string().nullable().optional(),
    statusGeneralCode: z.string().nullable().optional(),
    statusOperationalCode: z.string().nullable().optional(),
    categoryTTCode: z.string().nullable().optional(),
    deliveryMethodCode: z.string().nullable().optional(),
    searchChannelCode: z.string().nullable().optional(),
    primaryRouteCode: z.string().nullable().optional(),
    primaryAssortmentCode: z.string().nullable().optional(),
    priceTypeCode: z.string().nullable().optional(),
    agentCode1C: z.string().nullable().optional(),
  })
  .strict();

export type ClientUpdatePayload = z.infer<typeof clientUpdatePayloadSchema>;

export const syncJobActionSchema = z.enum(["update", "create"]);
export type SyncJobAction = z.infer<typeof syncJobActionSchema>;

export const syncEntityTypeSchema = z.enum(["client", "order", "payment"]);
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;
