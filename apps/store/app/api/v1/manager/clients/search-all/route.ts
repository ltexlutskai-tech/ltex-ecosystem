import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { maskPhone } from "@ltex/shared";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getOwnedClientIds } from "@/lib/manager/client-visibility";

/**
 * M1.3f — cross-manager picker endpoint.
 *
 * Повертає клієнтів **усіх** менеджерів з мінімальним набором полів для
 * document creation flows (M1.5+ — створення замовлення/презентації на
 * клієнта іншого менеджера). На відміну від `GET /clients` — не enforce-ить
 * ownership scope, але теж не виводить чутливі дані (phones/messengers/
 * bankAccounts взагалі не вибираються з DB).
 *
 * Кожен елемент має `isOwned: boolean` — фронт використовує для UI hint
 * (наприклад «Призначений: Олена» badge для не-своїх).
 *
 * Для admin-а `isOwned` завжди `true` (адмін не має концепту «своїх»).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const onlyMine = url.searchParams.get("onlyMine") === "true";
  const page = clampInt(url.searchParams.get("page"), 1, 1, 9_999);
  const pageSize = clampInt(url.searchParams.get("pageSize"), 20, 5, 50);

  const ownedIds = await getOwnedClientIds(user);

  const where: Prisma.MgrClientWhereInput = {};
  if (q.length > 0) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { tradePointName: { contains: q, mode: "insensitive" } },
      { code1C: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { phonePrimary: { contains: q } },
      { phones: { some: { phone: { contains: q } } } },
    ];
  }
  // «Мої клієнти» (7.3): фільтр по власних. Для admin (ownedIds=null) поняття
  // «свої» немає — режим ігнорується, повертаємо всіх.
  if (onlyMine && ownedIds !== null) {
    where.id = { in: [...ownedIds] };
  }

  const [total, rows] = await Promise.all([
    prisma.mgrClient.count({ where }),
    prisma.mgrClient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code1C: true,
        name: true,
        tradePointName: true,
        city: true,
        region: true,
        debt: true,
        priceTypeId: true,
        phonePrimary: true,
        street: true,
        house: true,
        novaPoshtaBranch: true,
        npCityRef: true,
        npCityName: true,
        npWarehouseRef: true,
        npWarehouseName: true,
        npAddressMatchedAt: true,
        deliveryMethod: { select: { code: true } },
        agent: { select: { id: true, fullName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    items: rows.map((c) => {
      const isOwned = ownedIds === null ? true : ownedIds.has(c.id);
      // Контакти: своїм — повністю; чужим — телефон masked, адреса прихована
      // (та сама політика, що в картці клієнта, M1.3f).
      const address = [c.street, c.house].filter(Boolean).join(", ") || null;
      return {
        id: c.id,
        code1C: c.code1C,
        name: c.name,
        tradePointName: c.tradePointName,
        city: c.city,
        region: c.region,
        phone: (isOwned ? c.phonePrimary : maskPhone(c.phonePrimary)) ?? null,
        address: isOwned ? address : null,
        debt: c.debt.toString(),
        priceTypeId: c.priceTypeId,
        deliveryMethodCode: c.deliveryMethod?.code ?? null,
        // Адресу НП віддаємо лише «своїм» (як телефон/адресу) — форма Реалізації
        // підставить її авто. Чужим — null (не прифілиться).
        novaPoshtaBranch: isOwned ? (c.novaPoshtaBranch ?? null) : null,
        npCityRef: isOwned ? (c.npCityRef ?? null) : null,
        npCityName: isOwned ? (c.npCityName ?? null) : null,
        npWarehouseRef: isOwned ? (c.npWarehouseRef ?? null) : null,
        npWarehouseName: isOwned ? (c.npWarehouseName ?? null) : null,
        npAddressMatched: isOwned ? c.npAddressMatchedAt != null : false,
        agent: c.agent ? { id: c.agent.id, fullName: c.agent.fullName } : null,
        isOwned,
      };
    }),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    // Admin не має поняття «свої» → пікер ховає перемикач «Мої/Всі».
    viewerIsAdmin: ownedIds === null,
  });
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
