import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser, isAdminRole } from "@/lib/auth/manager-auth";
import { TemplatesManager, type MessageTemplate } from "./templates-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Шаблони повідомлень — L-TEX Manager" };

export default async function MessageTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  // Зона видимості: власні шаблони АБО спільні (isShared) від інших.
  const rows = await prisma.mgrMessageTemplate.findMany({
    where: {
      OR: [{ createdByUserId: user.id }, { isShared: true }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      text: true,
      isShared: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const initial: MessageTemplate[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    text: t.text,
    isShared: t.isShared,
    createdByUserId: t.createdByUserId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Шаблони повідомлень
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Готові фрази для швидкої вставки у месенджер. «Мої» — ваші шаблони,
          «Спільні» — ті, якими поділилися інші менеджери. Видимість шаблону для
          інших вмикає його автор.
        </p>
      </header>
      <TemplatesManager
        initial={initial}
        currentUserId={user.id}
        isAdmin={isAdminRole(user.role)}
      />
    </div>
  );
}
