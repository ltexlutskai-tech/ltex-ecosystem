import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { BagStateStatusBadge } from "../_components/status-badge";
import { BagStatePostButton } from "../_components/post-button";
import { BagStateForm } from "../_components/bag-state-form";
import type { BagRow } from "../_components/bag-state-row";

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "manager",
  "senior_manager",
  "supervisor",
  "admin",
  "owner",
  "warehouse",
  "analyst",
  "bookkeeper",
  "expeditor",
] as const;

const WRITE_ROLES = ["warehouse", "admin", "owner"];

let uiRowSeq = 0;

export default async function BagStateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([...VIEW_ROLES]);
  if (!user) notFound();
  const { id } = await params;

  const doc = await prisma.bagStateChange.findUnique({
    where: { id },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  if (!doc) notFound();

  const isWrite = WRITE_ROLES.includes(user.role);
  const editable = doc.status === "draft" && isWrite;

  // Денормалізація імен для read-only перегляду.
  const agentIds = [
    ...new Set(
      doc.items
        .map((i) => i.reservedAgentUserId)
        .filter((v): v is string => !!v),
    ),
  ];
  const clientIds = [
    ...new Set(
      doc.items.map((i) => i.reservedClientId).filter((v): v is string => !!v),
    ),
  ];
  const [agentsAll, sectorsAll, agents, clients, historyCount] =
    await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.warehouseSector.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      agentIds.length
        ? prisma.user.findMany({
            where: { id: { in: agentIds } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
      clientIds.length
        ? prisma.mgrClient.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      prisma.lotStateHistory.count({ where: { recorderDocId: id } }),
    ]);
  const agentName = new Map(agents.map((a) => [a.id, a.fullName]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const sectorNameById = new Map(sectorsAll.map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="text-sm">
        <Link
          href="/manager/bag-state-changes"
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
              Зміна стану мішка · від {formatDate(doc.docDate)} ·{" "}
              <BagStateStatusBadge status={doc.status} /> · {doc.items.length}{" "}
              мішків · {historyCount} записів історії
            </p>
          </div>
          {isWrite && (
            <BagStatePostButton
              id={doc.id}
              // Провести з картки — лише для чернетки, коли форму редагування НЕ
              // показуємо (щоб не проводити застарілий стан замість введеного).
              canPost={doc.status === "draft" && !editable}
              canDelete={isWrite}
            />
          )}
        </div>
        {doc.notes && (
          <div className="mt-3 rounded-md bg-gray-50 p-2 text-sm text-gray-700">
            {doc.notes}
          </div>
        )}
      </div>

      {editable ? (
        <div>
          <h2 className="mb-2 text-sm font-medium text-gray-700">
            Редагування чернетки
          </h2>
          <BagStateForm
            mode="edit"
            docId={doc.id}
            agents={agentsAll}
            sectors={sectorsAll}
            initial={{
              docNumber: doc.docNumber,
              docDate: doc.docDate.toISOString().slice(0, 10),
              notes: doc.notes ?? "",
              rows: doc.items.map((it) => toRow(it, sectorsAll)),
            }}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-2 py-1.5">№</th>
                <th className="px-2 py-1.5">ШК</th>
                <th className="px-2 py-1.5 text-center">Відкр.</th>
                <th className="px-2 py-1.5 text-center">Відео</th>
                <th className="px-2 py-1.5 text-center">Цільов.</th>
                <th className="px-2 py-1.5 text-center">Ефір</th>
                <th className="px-2 py-1.5 text-center">Ефір дост.</th>
                <th className="px-2 py-1.5">Бронь</th>
                <th className="px-2 py-1.5">Контрагент</th>
                <th className="px-2 py-1.5">До</th>
                <th className="px-2 py-1.5">Сектор</th>
                <th className="px-2 py-1.5">Коментар</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {doc.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-2 py-1.5 text-gray-400">{i.lineNo}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{i.barcode}</td>
                  <td className="px-2 py-1.5 text-center">
                    {i.isOpen ? "✓" : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {i.hasVideo ? "✓" : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {i.isTarget ? "✓" : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {i.onAir ? "✓" : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {i.onAirDelivery ? "✓" : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {i.reservedAgentUserId
                      ? (agentName.get(i.reservedAgentUserId) ?? "—")
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {i.reservedClientId
                      ? (clientName.get(i.reservedClientId) ?? "—")
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">
                    {i.reservedUntil ? formatDate(i.reservedUntil) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {i.sectorId
                      ? (sectorNameById.get(i.sectorId) ?? i.sector ?? "—")
                      : (i.sector ?? "—")}
                  </td>
                  <td className="px-2 py-1.5 text-gray-600">
                    {i.comment ?? "—"}
                  </td>
                </tr>
              ))}
              {doc.items.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-2 py-6 text-center text-gray-400"
                  >
                    Рядків немає
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ItemRecord {
  barcode: string;
  lotId: string | null;
  productId: string | null;
  isOpen: boolean;
  hasVideo: boolean;
  isTarget: boolean;
  onAir: boolean;
  onAirDelivery: boolean;
  youtubeUrl: string | null;
  description: string | null;
  comment: string | null;
  reservedAgentUserId: string | null;
  reservedClientId: string | null;
  reservedUntil: Date | null;
  sector: string | null;
  sectorId: string | null;
}

/** Мапить рядок документа у стан форми редагування. */
function toRow(
  it: ItemRecord,
  sectors: { id: string; name: string }[],
): BagRow {
  uiRowSeq += 1;
  let sectorId = "";
  if (it.sectorId && sectors.some((s) => s.id === it.sectorId)) {
    sectorId = it.sectorId;
  } else if (it.sector) {
    sectorId = sectors.find((s) => s.name === it.sector)?.id ?? "";
  }
  return {
    key: `e${uiRowSeq}`,
    barcode: it.barcode,
    productId: it.productId,
    productName: "",
    weight: "",
    lotStatus: null,
    found: true,
    isOpen: it.isOpen,
    hasVideo: it.hasVideo,
    isTarget: it.isTarget,
    onAir: it.onAir,
    onAirDelivery: it.onAirDelivery,
    youtubeUrl: it.youtubeUrl ?? "",
    description: it.description ?? "",
    comment: it.comment ?? "",
    reservedAgentUserId: it.reservedAgentUserId ?? "",
    reservedClientId: it.reservedClientId,
    reservedClientSummary: null,
    reservedUntil: it.reservedUntil
      ? it.reservedUntil.toISOString().slice(0, 10)
      : "",
    sectorId,
    sectorNew: "",
    lookupError: null,
  };
}

function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}
