import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { isStockDocKind } from "@/lib/manager/stock-documents-api";
import { getStockDocMeta } from "@/lib/manager/stock-documents";
import { getRepackWeightTolerance } from "@/lib/manager/mgr-settings";
import { StockDocForm } from "../../_components/stock-doc-form";
import { InventoryBoard } from "../../_components/inventory-board";

export const dynamic = "force-dynamic";

// Перепаковка (повний цикл) — лише склад + адмін/власник.
const REPACK_ROLES = ["warehouse", "admin", "owner"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!isStockDocKind(kind)) return { title: "Новий документ | L-TEX Manager" };
  return { title: `Новий: ${getStockDocMeta(kind).label} | L-TEX Manager` };
}

export default async function NewStockDocPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!isStockDocKind(kind)) notFound();
  const user = await requireRole(["manager", "admin", "owner", "warehouse"]);
  if (!user) notFound();
  const isRepacking = kind === "repackings";
  if (isRepacking && !REPACK_ROLES.includes(user.role)) notFound();
  const meta = getStockDocMeta(kind);

  // Інвентаризація — окрема щільна таблична форма (по мішках).
  if (kind === "inventories") {
    return (
      <div className="mx-auto max-w-none space-y-4">
        <div className="text-sm">
          <Link
            href={`/manager/stock-documents/${meta.slug}`}
            className="text-gray-500 hover:text-gray-800 hover:underline"
          >
            ← Назад до списку
          </Link>
        </div>
        <h1 className="text-xl font-semibold">Новий: {meta.label}</h1>
        <InventoryBoard initialDoc={null} />
      </div>
    );
  }

  // Довідники якості/секторів/постачальників + допуск ваги — лише перепаковці.
  const [qualities, sectors, suppliers, weightTolerance] = isRepacking
    ? await Promise.all([
        prisma.quality.findMany({
          where: { archived: false },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.warehouseSector.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.supplier.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        getRepackWeightTolerance(),
      ])
    : [[], [], [], 2];

  return (
    <div
      className={`mx-auto space-y-4 ${isRepacking ? "max-w-none" : "max-w-4xl"}`}
    >
      <div className="text-sm">
        <Link
          href={`/manager/stock-documents/${meta.slug}`}
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Назад до списку
        </Link>
      </div>
      <h1 className="text-xl font-semibold">Новий: {meta.label}</h1>
      <StockDocForm
        kind={meta.kind}
        label={meta.label}
        showPrice={kind !== "warehouse-returns" && kind !== "stock-transfers"}
        showReason={kind === "write-offs" || kind === "stock-adjustments"}
        isRepacking={isRepacking}
        isInventory={false}
        showCustomer={kind === "product-returns"}
        showSupplier={kind === "supplier-returns"}
        qualities={qualities as { id: string; name: string }[]}
        sectors={sectors as { id: string; name: string }[]}
        suppliers={suppliers as { id: string; name: string }[]}
        weightTolerance={weightTolerance as number}
      />
    </div>
  );
}
