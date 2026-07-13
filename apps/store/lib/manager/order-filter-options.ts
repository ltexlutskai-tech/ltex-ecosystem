import { cache } from "react";
import { prisma } from "@ltex/db";

/**
 * Опції для фільтрів списку замовлень — щоб фільтри «місто» / «агент»
 * підтягувалися з наявних даних (довідник), а не набиралися вручну (виключає
 * помилку опечатки, 8.1).
 *
 *  • cities — унікальні міста клієнтів (за якими є замовлення), відсортовані;
 *  • agents — унікальні торгові агенти: історичні (`Order.agentName`) +
 *    активні менеджери (`User.fullName`), об'єднані й відсортовані.
 */
export interface OrderFilterOptions {
  cities: string[];
  agents: string[];
}

export const getOrderFilterOptions = cache(
  async (): Promise<OrderFilterOptions> => {
    const [cityRows, agentNameRows, users] = await Promise.all([
      prisma.customer.findMany({
        where: { city: { not: null } },
        distinct: ["city"],
        select: { city: true },
        orderBy: { city: "asc" },
        take: 3000,
      }),
      prisma.order.findMany({
        where: { agentName: { not: null } },
        distinct: ["agentName"],
        select: { agentName: true },
        take: 2000,
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { fullName: true },
      }),
    ]);

    const cities = Array.from(
      new Set(
        cityRows.map((r) => (r.city ?? "").trim()).filter((c) => c.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "uk"));

    const agents = Array.from(
      new Set(
        [
          ...agentNameRows.map((r) => (r.agentName ?? "").trim()),
          ...users.map((u) => (u.fullName ?? "").trim()),
        ].filter((a) => a.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b, "uk"));

    return { cities, agents };
  },
);
