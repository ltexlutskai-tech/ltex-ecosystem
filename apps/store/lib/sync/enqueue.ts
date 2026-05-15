import { randomUUID } from "node:crypto";
import { prisma } from "@ltex/db";
import type { ClientUpdatePayload } from "@/lib/validations/sync-job";

/**
 * Збирає payload для 1С `ОбновитиКлієнта` з MgrClient row + relations
 * і створює row у `mgr_sync_jobs` черзі.
 *
 * Cron-worker (`/api/cron/process-sync-queue`) поступово дренує чергу.
 *
 * Decimal-поля передаються як string з `.` decimal separator щоб уникнути
 * floating-point round-trip issues. Empty-string optional поля нормалізуються
 * у null.
 *
 * **DO NOT** робити цей call синхронно у HTTP-handler-i; завжди обертай
 * у try/catch і не fail-и сам PATCH якщо enqueue впав (sync — best-effort).
 */

export interface ClientForEnqueue {
  id: string;
  code1C: string | null;
  name: string;
  tradePointName: string | null;
  region: string | null;
  city: string | null;
  street: string | null;
  house: string | null;
  novaPoshtaBranch: string | null;
  websiteUrl: string | null;
  geolocation: string | null;
  monthlyVolume: { toString(): string } | null;
  licenseExpiresAt: Date | null;
  viberContact: string | null;
  dialogStatus: string | null;
  statusGeneral: { code: string } | null;
  statusOperational: { code: string } | null;
  categoryTT: { code: string } | null;
  deliveryMethod: { code: string } | null;
  searchChannel: { code: string } | null;
  primaryRoute: { code1C: string | null } | null;
  primaryAssortment: { code: string } | null;
  priceType: { code: string } | null;
  agent: { code1C: string | null } | null;
}

export function buildClientUpdatePayload(
  client: ClientForEnqueue,
): ClientUpdatePayload {
  return {
    code1C: client.code1C,
    name: client.name,
    tradePointName: emptyToNull(client.tradePointName),
    region: emptyToNull(client.region),
    city: emptyToNull(client.city),
    street: emptyToNull(client.street),
    house: emptyToNull(client.house),
    novaPoshtaBranch: emptyToNull(client.novaPoshtaBranch),
    websiteUrl: emptyToNull(client.websiteUrl),
    geolocation: emptyToNull(client.geolocation),
    monthlyVolume: client.monthlyVolume
      ? client.monthlyVolume.toString()
      : null,
    licenseExpiresAt: client.licenseExpiresAt
      ? client.licenseExpiresAt.toISOString()
      : null,
    viberContact: emptyToNull(client.viberContact),
    dialogStatus: emptyToNull(client.dialogStatus),
    statusGeneralCode: client.statusGeneral?.code ?? null,
    statusOperationalCode: client.statusOperational?.code ?? null,
    categoryTTCode: client.categoryTT?.code ?? null,
    deliveryMethodCode: client.deliveryMethod?.code ?? null,
    searchChannelCode: client.searchChannel?.code ?? null,
    primaryRouteCode: client.primaryRoute?.code1C ?? null,
    primaryAssortmentCode: client.primaryAssortment?.code ?? null,
    priceTypeCode: client.priceType?.code ?? null,
    agentCode1C: client.agent?.code1C ?? null,
  };
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v === "" ? null : v;
}

export async function enqueueClientUpdate(
  client: ClientForEnqueue,
  action: "update" | "create" = "update",
) {
  const payload = buildClientUpdatePayload(client);
  return prisma.mgrSyncJob.create({
    data: {
      entityType: "client",
      entityId: client.id,
      action,
      payload,
      idempotencyKey: randomUUID(),
      nextAttemptAt: new Date(),
    },
  });
}
