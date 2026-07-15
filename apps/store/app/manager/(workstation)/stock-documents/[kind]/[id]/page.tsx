import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { isStockDocKind } from "@/lib/manager/stock-documents-api";
import { getStockDocMeta } from "@/lib/manager/stock-documents";
import { BackButton } from "../../../_components/back-button";
import {
  fetchStockDoc,
  type StockDocLineView,
} from "@/lib/manager/stock-documents-fetch";
import { rowStatus, type RowStatus } from "@/lib/manager/inventory";
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
  const wide = kind === "repackings" || kind === "inventories";
  const isInventory = kind === "inventories";
  const invSummary = isInventory ? summarizeInventoryLines(doc.lines) : null;
  const invLogs = isInventory
    ? await prisma.inventoryLog.findMany({
        where: { inventoryId: id },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          userName: true,
          action: true,
          message: true,
          createdAt: true,
        },
      })
    : [];
  return (
    <div className={`mx-auto space-y-4 ${wide ? "max-w-none" : "max-w-5xl"}`}>
      <div className="text-sm">
        <BackButton fallbackHref={`/manager/stock-documents/${meta.slug}`} />
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
        {invSummary && (
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <InvChip label="Найменувань" value={String(invSummary.rows)} />
            <InvChip
              label="Знайдено"
              value={String(invSummary.found)}
              tone="emerald"
            />
            <InvChip
              label="Нестача"
              value={`${invSummary.missing} · ${invSummary.missingWeight.toFixed(1)} кг`}
              tone={invSummary.missing > 0 ? "amber" : undefined}
            />
            <InvChip
              label="Надлишки"
              value={`${invSummary.surplus} · ${invSummary.surplusWeight.toFixed(1)} кг`}
              tone={invSummary.surplus > 0 ? "sky" : undefined}
            />
            <InvChip
              label="Вага облік / факт"
              value={`${invSummary.accWeight.toFixed(1)} / ${invSummary.actWeight.toFixed(1)} кг`}
            />
            <InvChip
              label="Сума факт"
              value={`${invSummary.actAmountEur.toFixed(2)} €`}
            />
          </div>
        )}
      </div>
      {isInventory ? (
        <>
          <InventoryLinesTable lines={doc.lines} />
          <InventoryLogCard logs={invLogs} />
        </>
      ) : (
        <div className="rounded-md border bg-white p-4">
          <h2 className="mb-3 text-sm font-medium">
            Рядки ({doc.lines.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="w-8 px-2 py-1.5">№</th>
                  {kind === "repackings" && (
                    <th className="px-2 py-1.5">Роль</th>
                  )}
                  <th className="px-2 py-1.5">Товар / ШК</th>
                  <th className="px-2 py-1.5 text-right">Вага</th>
                  <th className="px-2 py-1.5 text-right">К-сть</th>
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
                    <td className="px-2 py-1 text-right">{it.quantity}</td>
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
      )}
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

// ─── Інвентаризація: зведення + щільна таблиця перегляду ───

interface InvLinesSummary {
  rows: number;
  found: number;
  missing: number;
  surplus: number;
  accWeight: number;
  actWeight: number;
  missingWeight: number;
  surplusWeight: number;
  actAmountEur: number;
}

function summarizeInventoryLines(
  lines: readonly StockDocLineView[],
): InvLinesSummary {
  const s: InvLinesSummary = {
    rows: 0,
    found: 0,
    missing: 0,
    surplus: 0,
    accWeight: 0,
    actWeight: 0,
    missingWeight: 0,
    surplusWeight: 0,
    actAmountEur: 0,
  };
  for (const l of lines) {
    const acc = l.qtyAccounting ?? 0;
    const act = l.qtyActual ?? 0;
    const st = rowStatus({ qtyAccounting: acc, qtyActual: act });
    if (st === "empty") continue;
    s.rows += 1;
    if (act > 0) {
      s.found += 1;
      s.actWeight += l.weight || 0;
      s.actAmountEur += l.priceEur * act;
    }
    if (acc > 0) s.accWeight += l.weight || 0;
    if (st === "missing") {
      s.missing += 1;
      s.missingWeight += l.weight || 0;
    } else if (st === "surplus") {
      s.surplus += 1;
      s.surplusWeight += l.weight || 0;
    }
  }
  return s;
}

const INV_ROW_CLASS: Record<RowStatus, string> = {
  matched: "bg-emerald-50/70",
  surplus: "bg-sky-50",
  missing: "",
  empty: "",
};

function InventoryLinesTable({ lines }: { lines: StockDocLineView[] }) {
  return (
    <div className="rounded-md border bg-white">
      <div className="border-b px-4 py-2 text-sm font-medium">
        Рядки ({lines.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 text-left uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-8 px-2 py-1.5">№</th>
              <th className="px-2 py-1.5">Артикул</th>
              <th className="px-2 py-1.5">Номенклатура</th>
              <th className="px-2 py-1.5">ШК</th>
              <th className="px-2 py-1.5">Сектор</th>
              <th className="px-2 py-1.5 text-right">Вага</th>
              <th className="px-2 py-1.5">Ед</th>
              <th className="px-2 py-1.5 text-right">Облік</th>
              <th className="px-2 py-1.5 text-right">Факт</th>
              <th className="px-2 py-1.5 text-right">Відхил.</th>
              <th className="px-2 py-1.5 text-right">Ціна €</th>
              <th className="px-2 py-1.5 text-right">Сума €</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((it, idx) => {
              const acc = it.qtyAccounting ?? 0;
              const act = it.qtyActual ?? 0;
              const diff = act - acc;
              const st = rowStatus({ qtyAccounting: acc, qtyActual: act });
              return (
                <tr key={it.id} className={INV_ROW_CLASS[st]}>
                  <td className="px-2 py-1 text-gray-400">{idx + 1}</td>
                  <td className="px-2 py-1 font-mono text-gray-700">
                    {it.articleCode || "—"}
                  </td>
                  <td
                    className="max-w-[240px] truncate px-2 py-1"
                    title={it.productName ?? ""}
                  >
                    {it.productId ? (
                      <Link
                        href={`/manager/prices/${it.productId}`}
                        className="hover:underline"
                      >
                        {it.productName ?? it.productId}
                      </Link>
                    ) : (
                      it.productName || (
                        <span className="text-gray-400">Невідомий товар</span>
                      )
                    )}
                  </td>
                  <td className="px-2 py-1 font-mono text-gray-500">
                    {it.barcode ?? "—"}
                  </td>
                  <td className="px-2 py-1">{it.sector || "—"}</td>
                  <td className="px-2 py-1 text-right">
                    {it.weight ? it.weight.toFixed(1) : "—"}
                  </td>
                  <td className="px-2 py-1 text-gray-500">
                    {it.unitName || "шт"}
                  </td>
                  <td className="px-2 py-1 text-right text-gray-600">{acc}</td>
                  <td className="px-2 py-1 text-right font-medium">
                    {act > 0 ? (
                      <span className="text-emerald-700">✓ {act}</span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td
                    className={`px-2 py-1 text-right font-medium ${
                      diff > 0
                        ? "text-sky-700"
                        : diff < 0
                          ? "text-amber-700"
                          : "text-gray-400"
                    }`}
                  >
                    {diff > 0 ? `+${diff}` : diff}
                  </td>
                  <td className="px-2 py-1 text-right text-gray-600">
                    {it.priceEur ? it.priceEur.toFixed(2) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-gray-700">
                    {(it.priceEur * act).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LOG_ACTION_LABEL: Record<string, string> = {
  fill: "Заповнення",
  found: "Знайдено",
  surplus: "Надлишок",
  unknown: "Невідомий ШК",
  edit: "Зміна",
  remove: "Видалення",
  header: "Шапка",
  post: "Проведення",
  reopen: "Розпроведення",
};

function InventoryLogCard({
  logs,
}: {
  logs: {
    id: string;
    userName: string | null;
    action: string;
    message: string;
    createdAt: Date;
  }[];
}) {
  return (
    <div className="rounded-md border bg-white">
      <div className="border-b px-4 py-2 text-sm font-medium">
        Журнал змін ({logs.length})
      </div>
      {logs.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">Журнал порожній.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-left uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-1.5">Час</th>
                <th className="px-3 py-1.5">Користувач</th>
                <th className="px-3 py-1.5">Дія</th>
                <th className="px-3 py-1.5">Деталі</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-3 py-1 text-gray-500">
                    {formatDateTime(l.createdAt)}
                  </td>
                  <td className="px-3 py-1 text-gray-700">
                    {l.userName || "—"}
                  </td>
                  <td className="px-3 py-1">
                    {LOG_ACTION_LABEL[l.action] ?? l.action}
                  </td>
                  <td className="px-3 py-1 text-gray-600">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDateTime(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi}`;
}

function InvChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "sky";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50"
          : "border-gray-200 bg-gray-50";
  return (
    <div className={`rounded-md border p-2 ${toneClass}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 font-semibold text-gray-800">{value}</div>
    </div>
  );
}
