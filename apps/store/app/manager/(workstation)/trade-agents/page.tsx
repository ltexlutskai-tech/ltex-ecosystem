import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { TradeAgentsManager } from "./_components/trade-agents-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Торгові агенти — L-TEX Manager" };

export default async function TradeAgentsPage() {
  const user = await requireRole(["admin", "owner"]);
  if (!user) redirect("/manager");

  const [items, users] = await Promise.all([
    prisma.mgrTradeAgent.findMany({
      orderBy: [{ archived: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        code1C: true,
        name: true,
        userId: true,
        archived: true,
        user: { select: { id: true, fullName: true } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Торгові агенти</h1>
        <p className="mt-1 text-sm text-gray-600">
          Довідник продавців / агентів. Можна зв'язати з користувачем системи. ←
          1С Торгові агенти.
        </p>
      </header>
      <TradeAgentsManager initial={items} users={users} />
    </div>
  );
}
