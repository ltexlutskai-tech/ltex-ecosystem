import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { UsersTable } from "./users-table";
import { InviteModal } from "./invite-modal";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Користувачі | L-TEX Manager",
};

export default async function ManagerUsersPage() {
  const admin = await requireRole(["admin"]);
  if (!admin) notFound();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      lastSeenAt: true,
      telegramChatId: true,
      createdAt: true,
    },
  });

  // Batch-lookup дзеркала 1С-агентів (MgrTradeAgent) по userId.
  const tradeAgents = await prisma.mgrTradeAgent.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, name: true, code1C: true },
  });
  const agentByUserId = new Map(
    tradeAgents
      .filter((a): a is typeof a & { userId: string } => a.userId !== null)
      .map((a) => [a.userId, { name: a.name, code1C: a.code1C }]),
  );

  const initial = users.map((u) => {
    const agent = agentByUserId.get(u.id);
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      telegramLinked: u.telegramChatId !== null,
      createdAt: u.createdAt.toISOString(),
      tradeAgentName: agent?.name ?? null,
      tradeAgentCode1C: agent?.code1C ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Користувачі</h1>
          <p className="mt-1 text-sm text-gray-600">
            Менеджери та адміністратори L-TEX Manager.
          </p>
        </div>
        <InviteModal />
      </div>
      <UsersTable initial={initial} currentUserId={admin.id} />
    </div>
  );
}
