import { prisma } from "@ltex/db";
import { normalizePhone } from "@ltex/shared";
import { matchClientByPhone } from "@/lib/chat/phone-match";

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
 * Best-effort — ніколи не кидає.
 */
export async function createSiteLead(opts: {
  name: string;
  phone: string;
  city?: string | null;
}): Promise<void> {
  try {
    const normalized = normalizePhone(opts.phone);
    if (!normalized) return;

    // Уже повноцінний клієнт → не лід.
    const client = await matchClientByPhone(normalized);
    if (client) return;

    // Дедуп: активний лід із цим телефоном уже є.
    const existing = await prisma.mgrLead.findFirst({
      where: { phone: normalized, status: { not: "converted" } },
      select: { id: true },
    });
    if (existing) return;

    await prisma.mgrLead.create({
      data: {
        name: opts.name.trim() || normalized,
        phone: normalized,
        city: opts.city ?? null,
        source: "site",
        status: "new",
      },
    });
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
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    await prisma.mgrLead.updateMany({
      where: { phone: normalized, status: { not: "converted" } },
      data: { status: "converted", convertedClientId: clientId },
    });
  } catch {
    // best-effort
  }
}
