import { prisma } from "@ltex/db";

/**
 * Резолв обраного у формі замовлення клієнта у запис `Customer`.
 *
 * **Проблема:** `ClientPicker` (через `clients/search-all`) повертає `MgrClient`,
 * тобто `MgrClient.id`. Але `Order.customerId` — FK на **`Customer`** (інша
 * модель). `MgrClient.id ≠ Customer.id`, тому пряме створення замовлення з
 * `customerId = MgrClient.id` падало з «Клієнта не знайдено» / FK-помилкою.
 *
 * **Рішення:** резолвимо обраного клієнта у `Customer` за стабільним бізнес-
 * ключем `code1C`, який спільний для обох моделей. Якщо `Customer` ще не існує
 * (наприклад клієнт є лише у дзеркалі `MgrClient`, ще не використовувався у
 * замовленнях) — створюємо його (find-or-create, як `app/api/quick-order`).
 *
 * Вхідний `rawClientId` може бути:
 *   1. `MgrClient.id` — основний шлях (вибір через `ClientPicker`);
 *   2. `Customer.id` — deeplink `?clientId=<Customer.id>` з картки клієнта
 *      (`client-orders-tab` мапить code1C → Customer.id перед лінком).
 *
 * Тому спершу пробуємо як `MgrClient`, потім як `Customer`.
 */

export interface ResolvedCustomer {
  id: string;
  code1C: string | null;
  name: string;
}

export class ResolveCustomerError extends Error {
  /** HTTP-статус, що endpoint поверне користувачу. */
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ResolveCustomerError";
    this.status = status;
  }
}

/**
 * Резолвить `rawClientId` у `Customer` (find-or-create по code1C/phone).
 *
 * @throws {ResolveCustomerError} якщо клієнта не знайдено у жодній моделі, або
 *   у `MgrClient` немає ані code1C, ані телефону (немає по чому find-or-create).
 */
export async function resolveCustomerForOrder(
  rawClientId: string,
): Promise<ResolvedCustomer> {
  const id = rawClientId.trim();
  if (!id) {
    throw new ResolveCustomerError("Не вказано клієнта", 400);
  }

  // ─── Шлях 1: rawClientId — це MgrClient.id (вибір через ClientPicker) ──────
  const mgr = await prisma.mgrClient.findUnique({
    where: { id },
    select: { code1C: true, name: true, phonePrimary: true, city: true },
  });

  if (mgr) {
    return findOrCreateCustomerFromMgr(mgr);
  }

  // ─── Шлях 2: rawClientId — це Customer.id (deeplink ?clientId=) ────────────
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, code1C: true, name: true },
  });
  if (customer) {
    return { id: customer.id, code1C: customer.code1C, name: customer.name };
  }

  throw new ResolveCustomerError("Клієнта не знайдено", 404);
}

/**
 * Find-or-create `Customer` для MgrClient. Пошук за code1C (унікальний),
 * далі за телефоном; інакше — create. Зберігаємо `code1C` щоб ownership
 * (`getMyClientCodes1C` / `canViewOrder` — працюють по `customer.code1C`)
 * лишався узгодженим з MgrClient.
 */
async function findOrCreateCustomerFromMgr(mgr: {
  code1C: string | null;
  name: string;
  phonePrimary: string | null;
  city: string | null;
}): Promise<ResolvedCustomer> {
  // 1. По code1C (унікальний у Customer) — найнадійніше зіставлення.
  if (mgr.code1C) {
    const byCode = await prisma.customer.findUnique({
      where: { code1C: mgr.code1C },
      select: { id: true, code1C: true, name: true },
    });
    if (byCode) {
      return { id: byCode.id, code1C: byCode.code1C, name: byCode.name };
    }
  }

  // 2. По телефону (Customer.phone НЕ unique → findFirst).
  if (mgr.phonePrimary) {
    const byPhone = await prisma.customer.findFirst({
      where: { phone: mgr.phonePrimary },
      select: { id: true, code1C: true, name: true },
    });
    if (byPhone) {
      return { id: byPhone.id, code1C: byPhone.code1C, name: byPhone.name };
    }
  }

  // 3. Немає по чому find-or-create — найчастіше клієнт без code1C і телефону.
  if (!mgr.code1C && !mgr.phonePrimary) {
    throw new ResolveCustomerError(
      "Клієнт ще не синхронізований з 1С (немає коду й телефону)",
      400,
    );
  }

  // 4. Create — переносимо бізнес-ключі з MgrClient.
  const created = await prisma.customer.create({
    data: {
      name: mgr.name,
      code1C: mgr.code1C,
      phone: mgr.phonePrimary,
      city: mgr.city,
    },
    select: { id: true, code1C: true, name: true },
  });
  return { id: created.id, code1C: created.code1C, name: created.name };
}
