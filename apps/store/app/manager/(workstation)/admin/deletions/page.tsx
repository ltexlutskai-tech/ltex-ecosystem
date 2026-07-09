import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { listDeletionRequests } from "@/lib/manager/deletion-queue";
import { DeletionsClient } from "./_components/deletions-client";
import { DeletionsStatusFilter } from "./_components/deletions-status-filter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Запити на вилучення | L-TEX Manager",
};

type StatusFilter = "pending" | "resolved" | "all";

export default async function DeletionsQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const user = await requireRole(["admin", "owner"]);
  if (!user) notFound();

  const sp = await searchParams;
  const status: StatusFilter =
    sp.status === "resolved" || sp.status === "all" ? sp.status : "pending";
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const { items, total } = await listDeletionRequests(status, page);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Запити на вилучення</h1>
        <p className="mt-1 text-sm text-gray-500">
          Позначки на вилучення від користувачів. Перевірте звʼязки перед
          остаточним видаленням: обʼєкт із посиланнями або історією 1С не можна
          стерти — лише перенести в архів (дані збережуться).
        </p>
      </div>

      <DeletionsStatusFilter status={status} />

      <DeletionsClient items={items} total={total} page={page} />
    </div>
  );
}
