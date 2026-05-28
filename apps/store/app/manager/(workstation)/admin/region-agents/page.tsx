import { notFound } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { getRegionLabel, UA_REGIONS } from "@/lib/constants/regions";
import { RegionAgentsManager } from "./_components/region-agents-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Регіони менеджерів — L-TEX Manager" };

/**
 * Чат-inbox Phase 2 — мапа «область → торговий».
 * Використовується ботом при реєстрації нового клієнта (`MgrRegionAgent`).
 * Лише admin.
 */
export default async function RegionAgentsPage() {
  const admin = await requireRole(["admin"]);
  if (!admin) notFound();

  const [items, users] = await Promise.all([
    prisma.mgrRegionAgent.findMany({
      orderBy: { region: "asc" },
      select: {
        id: true,
        region: true,
        userId: true,
        user: { select: { fullName: true, email: true, role: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ["admin", "senior_manager", "manager"] },
      },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, email: true, role: true },
    }),
  ]);

  const initialItems = items.map((it) => ({
    id: it.id,
    region: it.region,
    regionLabel: getRegionLabel(it.region) ?? it.region,
    userId: it.userId,
    userFullName: it.user.fullName,
    userEmail: it.user.email,
    userRole: it.user.role,
  }));

  const assignedSet = new Set(items.map((it) => it.region));
  const availableRegions = UA_REGIONS.filter((r) => !assignedSet.has(r.slug));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Регіони менеджерів</h1>
        <p className="mt-1 text-sm text-gray-600">
          Коли новий клієнт реєструється через бот і обирає область —
          призначаємо відповідного менеджера. Якщо область відсутня в мапі,
          клієнт лишається «без менеджера» (admin розрулює вручну).
        </p>
      </header>
      <RegionAgentsManager
        initial={initialItems}
        availableRegions={availableRegions}
        users={users}
      />
    </div>
  );
}
