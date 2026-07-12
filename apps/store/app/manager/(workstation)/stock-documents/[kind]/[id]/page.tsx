import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { isStockDocKind } from "@/lib/manager/stock-documents-api";
import { getStockDocMeta } from "@/lib/manager/stock-documents";
import { fetchStockDoc } from "@/lib/manager/stock-documents-fetch";
import { StockDocStatusBadge } from "../../_components/status-badge";
import { StockDocPostButton } from "../../_components/post-button";
import { StockDocReopenButton } from "../../_components/reopen-button";

export const dynamic = "force-dynamic";

const POST_ROLES = ["manager", "admin", "owner", "warehouse"];
const REPACK_WRITE_ROLES = ["warehouse", "admin", "owner"];

export default async function StockDocDetailPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
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
  const doc = await fetchStockDoc(kind, id);
  if (!doc) notFound();
  const writeRoles = kind === "repackings" ? REPACK_WRITE_ROLES : POST_ROLES;
  const canWrite = writeRoles.includes(user.role);
  const canPost = canWrite && doc.status === "draft";
  const canEdit = canWrite && doc.status === "draft";
  const canReopen = canWrite && doc.status === "posted";
  const wide = kind === "repackings";
  return (
    <div className={`mx-auto space-y-4 ${wide ? "max-w-none" : "max-w-5xl"}`}>
      <div className="text-sm">
        <Link
          href={`/manager/stock-documents/${meta.slug}`}
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Назад до списку
        </Link>
      </div>
      <div className="rounded-md border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">
              {doc.number1C ?? doc.docNumber}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              {meta.label} · від {formatDate(doc.docDate)} ·{" "}
              <StockDocStatusBadge status={doc.status} />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Link
                href={`/manager/stock-documents/${meta.slug}/${doc.id}/edit`}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ✏️ Редагувати
              </Link>
            )}
            {canReopen && <StockDocReopenButton kind={meta.kind} id={doc.id} />}
            {canPost && <StockDocPostButton kind={meta.kind} id={doc.id} />}
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-gray-700 sm:grid-cols-2 lg:grid-cols-3">
          {doc.customerName != null && (
            <Row label="Клієнт" value={doc.customerName || "—"} />
          )}
          {doc.supplierName != null && (
            <Row label="Постачальник" value={doc.supplierName || "—"} />
          )}
          {doc.reason != null && (
            <Row label="Причина" value={doc.reason || "—"} />
          )}
          <Row
            label="Сумарна вага"
            value={`${doc.totalWeight.toFixed(1)} кг`}
          />
          <Row label="К-сть" value={String(doc.totalQuantity)} />
          {doc.totalEur != null && (
            <Row label="Сума" value={`${doc.totalEur.toFixed(2)} €`} />
          )}
          {doc.inputWeight != null && (
            <Row
              label="Вхід / вихід / втрати"
              value={`${doc.inputWeight.toFixed(1)} / ${(doc.outputWeight ?? 0).toFixed(1)} / ${(doc.lossWeight ?? 0).toFixed(1)} кг`}
            />
          )}
          {doc.isClosed != null && (
            <Row label="Закрита" value={doc.isClosed ? "Так" : "Ні"} />
          )}
          {doc.postedAt && (
            <Row label="Проведено" value={formatDate(doc.postedAt)} />
          )}
        </div>
        {doc.notes && (
          <div className="mt-3 rounded-md bg-gray-50 p-2 text-sm text-gray-700">
            {doc.notes}
          </div>
        )}
      </div>
      <div className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">Рядки ({doc.lines.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-8 px-2 py-1.5">№</th>
                {kind === "repackings" && <th className="px-2 py-1.5">Роль</th>}
                <th className="px-2 py-1.5">Товар / ШК</th>
                <th className="px-2 py-1.5 text-right">Вага</th>
                {kind === "inventories" ? (
                  <>
                    <th className="px-2 py-1.5 text-right">Облік</th>
                    <th className="px-2 py-1.5 text-right">Факт</th>
                    <th className="px-2 py-1.5 text-right">Різниця</th>
                  </>
                ) : (
                  <th className="px-2 py-1.5 text-right">К-сть</th>
                )}
                {doc.totalEur != null && (
                  <th className="px-2 py-1.5 text-right">Сума €</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {doc.lines.map((it, idx) => (
                <tr key={it.id}>
                  <td className="px-2 py-1 text-gray-500">{idx + 1}</td>
                  {kind === "repackings" && (
                    <td className="px-2 py-1 text-xs">
                      {it.role === "assembled" ? "Комплектація" : "Розбір"}
                    </td>
                  )}
                  <td className="px-2 py-1">
                    {it.productId ? (
                      <Link
                        href={`/manager/prices/${it.productId}`}
                        className="hover:underline"
                      >
                        {it.productName ?? it.productId}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">
                        {it.barcode ?? "—"}
                      </span>
                    )}
                    {it.productId && it.barcode && (
                      <span className="ml-2 font-mono text-xs text-gray-400">
                        {it.barcode}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {it.weight.toFixed(1)}
                  </td>
                  {kind === "inventories" ? (
                    <>
                      <td className="px-2 py-1 text-right">
                        {(it.qtyAccounting ?? 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {(it.qtyActual ?? 0).toFixed(2)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right ${(it.qtyDifference ?? 0) !== 0 ? "text-amber-700" : ""}`}
                      >
                        {(it.qtyDifference ?? 0).toFixed(2)}
                      </td>
                    </>
                  ) : (
                    <td className="px-2 py-1 text-right">{it.quantity}</td>
                  )}
                  {doc.totalEur != null && (
                    <td className="px-2 py-1 text-right text-gray-700">
                      {it.amountEur.toFixed(2)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500">{label}:</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}
