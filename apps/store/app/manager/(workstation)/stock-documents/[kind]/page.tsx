import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import {
  isStockDocKind,
  listStockDocs,
} from "@/lib/manager/stock-documents-api";
import { getStockDocMeta } from "@/lib/manager/stock-documents";
import { StockDocStatusBadge } from "../_components/status-badge";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["manager", "admin", "owner", "warehouse"];
const REPACK_ROLES = ["warehouse", "admin", "owner"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!isStockDocKind(kind)) return { title: "Документи | L-TEX Manager" };
  return { title: `${getStockDocMeta(kind).label} | L-TEX Manager` };
}

export default async function StockDocListPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { kind } = await params;
  if (!isStockDocKind(kind)) notFound();
  const user = await requireRole([
    "manager",
    "senior_manager",
    "supervisor",
    "admin",
    "owner",
    "warehouse",
    "analyst",
    "bookkeeper",
    "expeditor",
  ]);
  if (!user) notFound();
  const meta = getStockDocMeta(kind);
  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page ?? "1"));
  const result = await listStockDocs(kind, {
    status: status || undefined,
    q: q || undefined,
    page,
  });
  const canCreate = (
    kind === "repackings" ? REPACK_ROLES : WRITE_ROLES
  ).includes(user.role);
  return (
    <div className="space-y-3">
      <div className="text-sm">
        <Link
          href="/manager/stock-documents"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Усі документи
        </Link>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{meta.label}</h1>
          <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
        </div>
        {canCreate && (
          <Link
            href={`/manager/stock-documents/${meta.slug}/new`}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            ➕ Створити
          </Link>
        )}
      </div>
      <form
        action={`/manager/stock-documents/${meta.slug}`}
        className="flex flex-wrap items-center gap-2 rounded-md border bg-white p-3"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Пошук: № документа…"
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— Усі статуси —</option>
          <option value="draft">Чернетка</option>
          <option value="posted">Проведено</option>
          <option value="archived">Архів</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          Шукати
        </button>
        {(q || status) && (
          <Link
            href={`/manager/stock-documents/${meta.slug}`}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Скинути
          </Link>
        )}
      </form>
      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">№ документа</th>
              <th className="px-3 py-2">Дата</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2 text-right">Вага, кг</th>
              <th className="px-3 py-2 text-right">К-сть</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {result.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  Документів немає
                </td>
              </tr>
            )}
            {result.items.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <Link
                    href={`/manager/stock-documents/${meta.slug}/${d.id}`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {d.number1C ?? d.docNumber}
                  </Link>
                </td>
                <td className="px-3 py-2 text-gray-600">
                  {formatDate(d.docDate)}
                </td>
                <td className="px-3 py-2">
                  <StockDocStatusBadge status={d.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  {d.totalWeight.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right">{d.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link
              href={pageHref(meta.slug, q, status, page - 1)}
              className="rounded-md border px-3 py-1 hover:bg-gray-50"
            >
              ← Попередня
            </Link>
          )}
          <span className="text-gray-500">
            {page} / {result.totalPages}
          </span>
          {page < result.totalPages && (
            <Link
              href={pageHref(meta.slug, q, status, page + 1)}
              className="rounded-md border px-3 py-1 hover:bg-gray-50"
            >
              Наступна →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function pageHref(slug: string, q: string, status: string, page: number) {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (status) sp.set("status", status);
  sp.set("page", String(page));
  return `/manager/stock-documents/${slug}?${sp.toString()}`;
}

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}
