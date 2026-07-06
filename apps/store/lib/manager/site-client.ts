import { prisma } from "@ltex/db";
import { normalizePhone } from "@ltex/shared";
import { matchClientByPhone } from "@/lib/chat/phone-match";
import { getRegionLabel, isValidRegionSlug } from "@/lib/constants/regions";

/**
 * Resolve-or-create CRM-клієнта для покупця з сайту (← 7.2 Блок 2).
 *
 * Викликається у сайтовому чекауті (`/api/orders`). Мета: кожен покупець із
 * кошика має бути присутній у довіднику `MgrClient` та маршрутизований на
 * торгового агента (для видимості замовлення менеджеру).
 *
 *   1. телефон збігся з наявним MgrClient → повертаємо його (агент — як є);
 *   2. інакше створюємо новий MgrClient (агент за мапою MgrRegionAgent за
 *      областю) + запис у таймлайн «зареєстрований із сайту».
 *
 * Best-effort: НІКОЛИ не кидає — чекаут не має падати через довідник CRM.
 * За помилки повертає `{ clientId: null, agentUserId: null, created: false }`
 * (замовлення все одно створиться, лише без прив'язки до агента).
 */
export interface SiteClientResult {
  clientId: string | null;
  agentUserId: string | null;
  created: boolean;
}

export async function resolveOrCreateSiteClient(opts: {
  name: string;
  phone: string;
  regionSlug?: string;
}): Promise<SiteClientResult> {
  try {
    const regionSlug =
      opts.regionSlug && isValidRegionSlug(opts.regionSlug)
        ? opts.regionSlug
        : null;

    // Агент за мапою область→агент (спільно для нового й наявного клієнта).
    async function regionAgentId(): Promise<string | null> {
      if (!regionSlug) return null;
      const ra = await prisma.mgrRegionAgent.findUnique({
        where: { region: regionSlug },
        select: { userId: true },
      });
      return ra?.userId ?? null;
    }

    const match = await matchClientByPhone(opts.phone);
    if (match) {
      // Наявний клієнт: бекфіл області (якщо порожня) та агента (якщо не
      // призначений) з даних, які покупець вказав на сайті. Це закриває кейс
      // «клієнт вже є, але без агента/області» — раніше вони ігнорувались.
      let agentUserId = match.agentUserId;
      if (regionSlug) {
        const existing = await prisma.mgrClient.findUnique({
          where: { id: match.clientId },
          select: { region: true, agentUserId: true },
        });
        const updates: { region?: string; agentUserId?: string } = {};
        if (!existing?.region) {
          updates.region = getRegionLabel(regionSlug) ?? regionSlug;
        }
        if (!existing?.agentUserId) {
          const rid = await regionAgentId();
          if (rid) {
            updates.agentUserId = rid;
            agentUserId = rid;
          }
        }
        if (Object.keys(updates).length > 0) {
          await prisma.mgrClient.update({
            where: { id: match.clientId },
            data: updates,
          });
        }
      }
      return { clientId: match.clientId, agentUserId, created: false };
    }

    const normalized = normalizePhone(opts.phone);
    const agentUserId = await regionAgentId();

    const client = await prisma.mgrClient.create({
      data: {
        name: opts.name.trim() || normalized || "Клієнт із сайту",
        phonePrimary: normalized,
        region: regionSlug ? getRegionLabel(regionSlug) : null,
        agentUserId,
      },
      select: { id: true },
    });

    await prisma.mgrClientTimelineEntry.create({
      data: {
        clientId: client.id,
        kind: "registration",
        body: "Клієнт зареєстрований із сайту (замовлення з кошика).",
        occurredAt: new Date(),
      },
    });

    return { clientId: client.id, agentUserId, created: true };
  } catch {
    return { clientId: null, agentUserId: null, created: false };
  }
}
