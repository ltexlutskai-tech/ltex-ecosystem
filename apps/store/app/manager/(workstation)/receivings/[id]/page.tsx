import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { ReceivingActions } from "../_components/receiving-actions";

export const dynamic = "force-dynamic";

export default async function ReceivingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([
    "warehouse",
    "admin",
    "owner",
    "supervisor",
    "analyst",
    "bookkeeper",
  ]);
  if (!user) notFound();
  const { id } = await params;

  const doc = await prisma.receiving.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } },
      createdBy: { select: { fullName: true } },
      postedBy: { select: { fullName: true } },
      cancelledBy: { select: { fullName: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { id: true, name: true, articleCode: true } },
          createdLot: {
            select: { id: true, barcode: true, status: true },
          },
        },
      },
    },
  });
  if (!doc) notFound();

  const canActWarehouse =
    user.role === "warehouse" || user.role === "admin" || user.role === "owner";
  const canCancel = user.role === "admin" || user.role === "owner";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/receivings"
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Назад до списку
        </Link>
      </div>

      <div className="rounded-md border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">{doc.docNumber}</h1>
            <p className="mt-1 text-sm text-gray-600">
              від {formatDate(doc.docDate)} ·{" "}
              <StatusBadge status={doc.status} />
            </p>
          </div>
          <ReceivingActions
            id={doc.id}
            status={doc.status}
            canActWarehouse={canActWarehouse}
            canCancel={canCancel}
          />
        </div>

        <div className="mt-4 grid gap-2 text-sm text-gray-700 sm:grid-cols-2 lg:grid-cols-3">
          <Row label="Постачальник" value={doc.supplier.name} />
          <Row label="Склад" value={doc.warehouse.name} />
          <Row label="Валюта" value={doc.currency} />
          <Row label="Курс до EUR" value={String(doc.exchangeRate)} />
          {doc.inboundDocNumber && (
            <Row label="№ накладної постач." value={doc.inboundDocNumber} />
          )}
          <Row label="Створив" value={doc.createdBy?.fullName ?? "—"} />
          {doc.postedBy && (
            <Row
              label="Провів"
              value={`${doc.postedBy.fullName} (${formatDateTime(doc.postedAt)})`}
            />
          )}
          {doc.cancelledBy && (
            <Row
              label="Скасував"
              value={`${doc.cancelledBy.fullName} (${formatDateTime(doc.cancelledAt)}). ${doc.cancelReason ?? ""}`}
            />
          )}
          <Row
            label="Сумарна вага"
            value={`${doc.totalWeight.toFixed(1)} кг`}
          />
          <Row label="Сумарно мішків" value={String(doc.totalQuantity)} />
          <Row
            label="Сума документа"
            value={`${doc.totalAmount.toFixed(2)} ${doc.currency}`}
          />
        </div>

        {doc.notes && (
          <div className="mt-3 rounded-md bg-gray-50 p-2 text-sm text-gray-700">
            {doc.notes}
          </div>
        )}
      </div>

      {/* Рядки */}
      <div className="rounded-md border bg-white p-4">
        <h2 className="mb-3 text-sm font-medium">Рядки ({doc.items.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-1.5">Товар</th>
                <th className="px-2 py-1.5 text-right">Вага, кг</th>
                <th className="px-2 py-1.5 text-right">К-сть</th>
                <th className="px-2 py-1.5 text-right">Ціна / Сума</th>
                <th className="px-2 py-1.5">Штрихкод</th>
                <th className="px-2 py-1.5">Лот</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {doc.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-2 py-1.5 text-gray-900">
                    <Link
                      href={`/manager/prices/${it.product.id}`}
                      className="hover:underline"
                    >
                      {it.product.name}
                    </Link>
                    {it.product.articleCode && (
                      <span className="ml-1 text-xs text-gray-500">
                        ({it.product.articleCode})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {it.weight.toFixed(1)}
                  </td>
                  <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                  <td className="px-2 py-1.5 text-right text-gray-600 whitespace-nowrap">
                    {it.purchasePrice.toFixed(2)} / {it.lineAmount.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-xs font-mono">
                    {it.barcode ?? (
                      <span className="text-gray-400">
                        ({it.barcodeSource})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {it.createdLot ? (
                      <Link
                        href={`/manager/prices/lots?barcode=${encodeURIComponent(it.createdLot.barcode)}`}
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        {it.createdLot.barcode}
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
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

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; color: string }> = {
    draft: { label: "Чернетка", color: "bg-gray-100 text-gray-700" },
    posted: { label: "Проведено", color: "bg-emerald-100 text-emerald-800" },
    cancelled: { label: "Скасовано", color: "bg-red-100 text-red-700" },
  };
  const m = meta[status] ?? {
    label: status,
    color: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${m.color}`}>
      {m.label}
    </span>
  );
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear());
  return `${dd}.${mm}.${yy}`;
}

function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mi}`;
}
