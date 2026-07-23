import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { AutoRefresh } from "../_components/auto-refresh";
import { TaskTypeTabs } from "../_components/task-type-tabs";
import { videoTaskStatusMeta } from "@/lib/manager/video-task-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Відеозона — L-TEX Manager" };

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function startOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

export default async function VideoTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const tab = firstParam(sp.tab) === "done" ? "done" : "active";

  const isVideozone = ["videozone", "admin", "owner"].includes(user.role);
  const isWarehouse = user.role === "warehouse";
  // Відеозона не бачить клієнта у списку — лише товар/артикул/мішок.
  const hideClient = user.role === "videozone";

  // Зріз «на мене» за роллю.
  const scope: Record<string, unknown> = isVideozone
    ? {}
    : isWarehouse
      ? {} // склад бачить усі, діє на «new»
      : { managerUserId: user.id }; // менеджер — свої

  const where =
    tab === "done"
      ? { ...scope, status: "done" }
      : { ...scope, status: { in: ["new", "filming"] } };

  const tasks = await prisma.mgrVideoTask.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      bags: {
        select: { barcode: true, videoUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Лічильник виконаних за поточний місяць (реєстр «я відзняв»).
  const now = new Date();
  const doneScope: Record<string, unknown> = isVideozone
    ? {}
    : isWarehouse
      ? {}
      : { managerUserId: user.id };
  const monthCount = await prisma.mgrVideoTask.count({
    where: {
      ...doneScope,
      status: "done",
      completedAt: { gte: startOfMonth(now) },
    },
  });

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <TaskTypeTabs role={user.role} active="video" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Відеозона</h1>
          <p className="mt-1 text-sm text-gray-500">
            Зйомка відеооглядів для клієнтів. Склад приносить мішок → відеозона
            знімає, заповнює характеристики й формує опис.
          </p>
        </div>
        <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          Відзнято за місяць:{" "}
          <span className="font-semibold text-gray-900">{monthCount}</span>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {(
          [
            { key: "active", label: "Активні" },
            { key: "done", label: "Виконані" },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={`/manager/video-tasks?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t.key
                ? "border-green-600 font-medium text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-gray-500">
          {tab === "done"
            ? "Виконаних відеозавдань поки немає."
            : "Активних відеозавдань немає."}
        </p>
      ) : (
        <div className="grid gap-2">
          {tasks.map((t) => {
            const meta = videoTaskStatusMeta(t);
            return (
              <Link
                key={t.id}
                href={`/manager/video-tasks/${t.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white p-3 hover:border-green-400 hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">
                    {t.productName}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {hideClient ? "" : `Клієнт: ${t.clientName ?? "—"} · `}
                    {t.quantity} міш.
                    {t.articleCode ? ` · арт. ${t.articleCode}` : ""}
                    {t.bags.length > 0
                      ? ` · ${t.bags
                          .map((b) => b.barcode)
                          .filter(Boolean)
                          .join(", ")}`
                      : ""}
                    {t.managerName ? ` · менеджер: ${t.managerName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.bags.some((b) => b.videoUrl) ? (
                    <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
                      відео є
                    </span>
                  ) : null}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
