export const dynamic = "force-dynamic";

import Link from "next/link";
import { Prisma, prisma } from "@ltex/db";
import { Badge, Button } from "@ltex/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { retrySyncJob } from "./actions";

const STATUS_FILTERS = [
  "all",
  "pending",
  "retrying",
  "sent",
  "failed",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_LABELS: Record<string, string> = {
  pending: "Очікує",
  retrying: "Повтор",
  sent: "Надіслано",
  failed: "Помилка",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "accent" | "outline" | "destructive"
> = {
  pending: "secondary",
  retrying: "accent",
  sent: "default",
  failed: "destructive",
};

const ENTITY_LABELS: Record<string, string> = {
  client: "Клієнт",
  order: "Замовлення",
  payment: "Оплата",
};

const PAGE_SIZE = 50;

export default async function AdminSyncJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status: StatusFilter = STATUS_FILTERS.includes(
    params.status as StatusFilter,
  )
    ? (params.status as StatusFilter)
    : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.MgrSyncJobWhereInput =
    status === "all"
      ? {}
      : { status: status as "pending" | "retrying" | "sent" | "failed" };

  const [jobs, total, statusCounts] = await Promise.all([
    prisma.mgrSyncJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.mgrSyncJob.count({ where }),
    prisma.mgrSyncJob.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const countByStatus = new Map(
    statusCounts.map((c) => [c.status, c._count.id]),
  );
  const totalAll = statusCounts.reduce((acc, c) => acc + c._count.id, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Черга sync до 1С</h1>
        <p className="text-sm text-gray-500">
          {total} записів на сторінці {page}/{totalPages}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterPill
          href="/admin/sync-jobs"
          active={status === "all"}
          label={`Всі (${totalAll})`}
        />
        {(["pending", "retrying", "sent", "failed"] as const).map((s) => (
          <FilterPill
            key={s}
            href={`/admin/sync-jobs?status=${s}`}
            active={status === s}
            label={`${STATUS_LABELS[s]} (${countByStatus.get(s) ?? 0})`}
          />
        ))}
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-gray-500">Записів не знайдено</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Тип</th>
                <th className="px-4 py-3 font-medium">Сутність</th>
                <th className="px-4 py-3 font-medium">Дія</th>
                <th className="px-4 py-3 font-medium">Спроби</th>
                <th className="px-4 py-3 font-medium">Помилка</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                    {new Date(job.createdAt).toLocaleString("uk-UA")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANTS[job.status] ?? "outline"}>
                      {STATUS_LABELS[job.status] ?? job.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ENTITY_LABELS[job.entityType] ?? job.entityType}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {job.entityId.slice(0, 12)}…
                  </td>
                  <td className="px-4 py-3 text-xs">{job.action}</td>
                  <td className="px-4 py-3 text-xs">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {job.lastError ? (
                      <details className="cursor-pointer">
                        <summary className="truncate text-xs text-red-600 hover:text-red-800">
                          {job.lastError.slice(0, 60)}
                          {job.lastError.length > 60 ? "..." : ""}
                        </summary>
                        <pre className="mt-1 max-h-40 max-w-xs overflow-auto rounded bg-red-50 p-2 text-xs text-red-900 whitespace-pre-wrap">
                          {job.lastError}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {job.status === "failed" || job.status === "retrying" ? (
                      <form
                        action={async () => {
                          "use server";
                          await retrySyncJob(job.id);
                        }}
                      >
                        <Button type="submit" size="sm" variant="outline">
                          Повторити
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/sync-jobs?${status === "all" ? "" : `status=${status}&`}page=${p}`}
              className={`rounded px-3 py-1 text-sm ${
                p === page
                  ? "bg-blue-600 text-white"
                  : "border bg-white hover:bg-gray-50"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-1 text-sm ${
        active
          ? "bg-green-50 text-green-700 border-green-200"
          : "hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}
