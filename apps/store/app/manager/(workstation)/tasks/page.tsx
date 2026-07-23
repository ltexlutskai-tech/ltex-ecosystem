import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { getTasksForUser } from "@/lib/manager/tasks";
import { TaskTypeTabs } from "../_components/task-type-tabs";
import { TasksClient } from "./_components/tasks-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Завдання — L-TEX Manager" };

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const [{ assignedToMe, createdByMe, completed }, users] = await Promise.all([
    getTasksForUser(user),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <TaskTypeTabs role={user.role} active="assignments" />
      <TasksClient
        assignedToMe={assignedToMe}
        createdByMe={createdByMe}
        completed={completed}
        users={users}
        currentUserId={user.id}
      />
    </div>
  );
}
