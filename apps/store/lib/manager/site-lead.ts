import { prisma } from "@ltex/db";
import { normalizePhone, phoneMatchKey } from "@ltex/shared";
import { matchClientByPhone } from "@/lib/chat/phone-match";
import { getRegionLabel, isValidRegionSlug } from "@/lib/constants/regions";

/**
 * Ліди з сайту (7.2 Блок 2 доповнення).
 *
 * Реєстрація на сайті створює ЛІД (`MgrLead`), а не повноцінного клієнта.
 * Менеджер бачить ліди окремою вкладкою в «Клієнтах» і конвертує їх у
 * `MgrClient` вручну (після контакту) або автоматично (при першому замовленні).
 */

/**
 * Створює лід із реєстрації на сайті. Пропускає, якщо телефон уже належить
 * повноцінному клієнту, або якщо активний (неконвертований) лід уже існує.
 *
 * `regionSlug` (обовʼязкова область при реєстрації) → зберігаємо назву області
 * у `region` і одразу підвʼязуємо менеджера за мапою «область→агент»
 * (`MgrRegionAgent`), щоб лід уже був закріплений за потрібним менеджером.
 *
 * Best-effort — ніколи не кидає.
 */
export async function createSiteLead(opts: {
  name: string;
  phone: string;
  regionSlug?: string | null;
  city?: string | null;
}): Promise<void> {
  try {
    const normalized = normalizePhone(opts.phone);
    const key = phoneMatchKey(opts.phone);
    if (!normalized || !key) return;

    // Уже повноцінний клієнт → не лід. АЛЕ архівного/вилученого клієнта
    // трактуємо як «не існує»: створюємо лід знову + сповіщаємо адміністратора
    // про ситуацію (рішення user, 2026-07-23).
    let archivedClientName: string | null = null;
    const client = await matchClientByPhone(normalized);
    if (client) {
      const row = await prisma.mgrClient.findUnique({
        where: { id: client.clientId },
        select: { name: true, archived: true, markedForDeletion: true },
      });
      if (row && !row.archived && !row.markedForDeletion) return;
      archivedClientName = row?.name ?? null;
    }

    // Дедуп: активний лід із цим телефоном уже є (звірка по 9 цифрах).
    const existing = await prisma.mgrLead.findFirst({
      where: { phoneKey: key, status: { not: "converted" } },
      select: { id: true },
    });
    if (existing) return;

    const regionSlug =
      opts.regionSlug && isValidRegionSlug(opts.regionSlug)
        ? opts.regionSlug
        : null;
    const region = regionSlug ? getRegionLabel(regionSlug) : null;
    const agentUserId = regionSlug
      ? ((
          await prisma.mgrRegionAgent.findUnique({
            where: { region: regionSlug },
            select: { userId: true },
          })
        )?.userId ?? null)
      : null;

    const displayName = opts.name.trim() || normalized;
    await prisma.mgrLead.create({
      data: {
        name: displayName,
        phone: normalized,
        region,
        agentUserId,
        city: opts.city ?? null,
        source: "site",
        status: "new",
      },
    });

    // Сповіщення (MgrReminder → дзвіночок): менеджеру за областю, а без нього —
    // адмінам/власникам. Кейс архівного клієнта — окреме сповіщення адмінам.
    await notifyAboutNewLead({
      name: displayName,
      phone: normalized,
      region,
      agentUserId,
      archivedClientName,
    });
  } catch {
    // best-effort
  }
}

/** Сповіщення про новий лід: агенту області або адмінам (fallback). */
async function notifyAboutNewLead(opts: {
  name: string;
  phone: string;
  region: string | null;
  agentUserId: string | null;
  archivedClientName: string | null;
}): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["admin", "owner"] } },
      select: { id: true },
    });
    const adminIds = admins.map((a) => a.id);

    const base = `Новий лід з сайту: ${opts.name}, ${opts.phone}${opts.region ? ", " + opts.region : ""}. Дивіться «Клієнти → Ліди».`;
    const recipients = new Set<string>(
      opts.agentUserId ? [opts.agentUserId] : adminIds,
    );

    const now = new Date();
    await prisma.mgrReminder.createMany({
      data: [...recipients].map((ownerUserId) => ({
        ownerUserId,
        body: base,
        remindAt: now,
        source: "manual" as const,
      })),
    });

    // Архівний клієнт з таким самим номером — окремо адмінам.
    if (opts.archivedClientName) {
      await prisma.mgrReminder.createMany({
        data: adminIds.map((ownerUserId) => ({
          ownerUserId,
          body: `⚠️ Лід з сайту (${opts.name}, ${opts.phone}) має номер АРХІВНОГО клієнта «${opts.archivedClientName}» — перевірте, чи не відновити картку.`,
          remindAt: now,
          source: "manual" as const,
        })),
      });
    }
  } catch {
    // best-effort
  }
}

/**
 * Позначає активні ліди з цим телефоном як конвертовані у клієнта.
 * Викликається коли лід стає повноцінним MgrClient (при замовленні / вручну).
 */
export async function markLeadsConverted(
  phone: string | null | undefined,
  clientId: string,
): Promise<void> {
  try {
    if (!phone) return;
    const key = phoneMatchKey(phone);
    if (!key) return;
    await prisma.mgrLead.updateMany({
      where: { phoneKey: key, status: { not: "converted" } },
      data: { status: "converted", convertedClientId: clientId },
    });
  } catch {
    // best-effort
  }
}
