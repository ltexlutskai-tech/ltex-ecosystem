import { prisma } from "@ltex/db";
import { normalizePhone, phoneMatchKey } from "@ltex/shared";

/**
 * Результат пошуку клієнта за телефоном.
 * Phone — нормалізований E.164 номер (або вхідний, якщо не нормалізувався).
 */
export interface PhoneMatchResult {
  clientId: string;
  agentUserId: string | null;
  phone: string;
}

/**
 * Шукає `MgrClient` за телефоном НЕЗАЛЕЖНО від формату номера.
 *
 * Звірка йде по `phoneKey` — це БД-обчислювані останні 9 цифр номера
 * (`GENERATED ALWAYS`). Тому збігаються `0501234567`, `+380501234567`,
 * `380501234567` тощо — усі варіанти написання того самого номера, і навіть
 * «брудні» формати з 1С (пробіли/дужки). Три рівні пошуку:
 *
 *   1. `MgrClientPhone.phoneKey` — додаткові номери клієнта
 *   2. `MgrClient.phoneKey`      — основний номер
 *   3. `Customer.phoneKey`       → резолв `MgrClient` через `code1C`
 *
 * Повертає `null`, коли номер надто короткий (`phoneMatchKey` = null) або
 * жоден рівень не знайшов клієнта.
 */
export async function matchClientByPhone(
  rawPhone: string,
): Promise<PhoneMatchResult | null> {
  const key = phoneMatchKey(rawPhone);
  if (!key) return null;

  const phone = normalizePhone(rawPhone) ?? rawPhone;

  // Рівень 1: додаткові номери клієнта
  const phoneRow = await prisma.mgrClientPhone.findFirst({
    where: { phoneKey: key },
    select: { clientId: true },
  });
  if (phoneRow) {
    const client = await prisma.mgrClient.findUnique({
      where: { id: phoneRow.clientId },
      select: { id: true, agentUserId: true },
    });
    if (client) {
      return { clientId: client.id, agentUserId: client.agentUserId, phone };
    }
  }

  // Рівень 2: основний номер клієнта
  const primary = await prisma.mgrClient.findFirst({
    where: { phoneKey: key },
    select: { id: true, agentUserId: true },
  });
  if (primary) {
    return { clientId: primary.id, agentUserId: primary.agentUserId, phone };
  }

  // Рівень 3: Customer.phone → MgrClient через code1C
  const customer = await prisma.customer.findFirst({
    where: { phoneKey: key },
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
        phone,
      };
    }
  }

  return null;
}
