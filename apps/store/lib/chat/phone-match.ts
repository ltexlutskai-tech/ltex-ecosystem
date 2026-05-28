import { prisma } from "@ltex/db";
import { normalizePhone } from "@ltex/shared";

/**
 * Результат пошуку клієнта за телефоном.
 * Phone — нормалізований E.164 номер, який збігся.
 */
export interface PhoneMatchResult {
  clientId: string;
  agentUserId: string | null;
  phone: string;
}

/**
 * Шукає `MgrClient` за телефоном (3 рівні пошуку):
 *
 *   1. `MgrClientPhone.phone` — exact match (додаткові номери клієнта)
 *   2. `MgrClient.phonePrimary` — exact match (основний номер)
 *   3. `Customer.phone` — exact match → резолв `MgrClient` через `code1C`
 *
 * Повертає `null` коли:
 *   - вхід не нормалізується (`normalizePhone` повернув `null`)
 *   - жоден з трьох рівнів не знайшов клієнта
 *   - знайдений `Customer.code1C` не має пов'язаного `MgrClient`
 */
export async function matchClientByPhone(
  rawPhone: string,
): Promise<PhoneMatchResult | null> {
  const normalized = normalizePhone(rawPhone);
  if (!normalized) return null;

  // Рівень 1: додаткові номери клієнта
  const phoneRow = await prisma.mgrClientPhone.findFirst({
    where: { phone: normalized },
    select: { clientId: true },
  });
  if (phoneRow) {
    const client = await prisma.mgrClient.findUnique({
      where: { id: phoneRow.clientId },
      select: { id: true, agentUserId: true },
    });
    if (client) {
      return {
        clientId: client.id,
        agentUserId: client.agentUserId,
        phone: normalized,
      };
    }
  }

  // Рівень 2: основний номер клієнта
  const primary = await prisma.mgrClient.findFirst({
    where: { phonePrimary: normalized },
    select: { id: true, agentUserId: true },
  });
  if (primary) {
    return {
      clientId: primary.id,
      agentUserId: primary.agentUserId,
      phone: normalized,
    };
  }

  // Рівень 3: Customer.phone → MgrClient через code1C
  const customer = await prisma.customer.findFirst({
    where: { phone: normalized },
    select: { code1C: true },
  });
  if (customer?.code1C) {
    const mgrByCode = await prisma.mgrClient.findUnique({
      where: { code1C: customer.code1C },
      select: { id: true, agentUserId: true },
    });
    if (mgrByCode) {
      return {
        clientId: mgrByCode.id,
        agentUserId: mgrByCode.agentUserId,
        phone: normalized,
      };
    }
  }

  return null;
}
