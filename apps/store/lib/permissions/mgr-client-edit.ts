import { prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";

export async function canEditClient(
  user: Pick<CurrentManager, "id" | "role">,
  clientId: string,
): Promise<boolean> {
  if (user.role === "admin") return true;

  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: {
      agentUserId: true,
      assignments: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!client) return false;
  if (client.agentUserId === user.id) return true;
  if (client.assignments.length > 0) return true;
  return false;
}
