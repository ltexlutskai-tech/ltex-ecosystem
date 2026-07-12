import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { requireRole } from "@/lib/auth/manager-auth";
import { isStockDocKind } from "@/lib/manager/stock-documents-api";
import { getStockDocMeta } from "@/lib/manager/stock-documents";
import { fetchStockDoc } from "@/lib/manager/stock-documents-fetch";
import { getRepackWeightTolerance } from "@/lib/manager/mgr-settings";
import {
  StockDocForm,
  type StockDocInitial,
  type StockDocInitialRow,
} from "../../../_components/stock-doc-form";
import {
  InventoryForm,
  type InventoryFormInitial,
} from "../../../_components/inventory-form";

export const dynamic = "force-dynamic";

const REPACK_ROLES = ["warehouse", "admin", "owner"];

function num(n: number | null | undefined): string {
  return n == null || n === 0 ? "" : String(n);
}

export default async function EditStockDocPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isStockDocKind(kind)) notFound();
  const user = await requireRole(["manager", "admin", "owner", "warehouse"]);
  if (!user) notFound();
  const isRepacking = kind === "repackings";
  if (isRepacking && !REPACK_ROLES.includes(user.role)) notFound();

  const meta = getStockDocMeta(kind);
  const doc = await fetchStockDoc(kind, id);
  if (!doc) notFound();
  // Редагувати можна лише чернетку. Проведений — спершу «Розпровести».
  if (doc.status !== "draft") {
    redirect(`/manager/stock-documents/${meta.slug}/${id}`);
  }

  // Інвентаризація — окрема щільна таблична форма (по мішках).
  if (kind === "inventories") {
    const initial: InventoryFormInitial = {
      id: doc.id,
      docDate: doc.docDate.toISOString().slice(0, 10),
      notes: doc.notes ?? "",
      rows: doc.lines.map((l) => ({
        lotId: l.lotId ?? null,
        productId: l.productId,
        productName: l.productName ?? "",
        articleCode: l.articleCode ?? "",
        barcode: l.barcode ?? "",
        sector: l.sector ?? "",
        quality: l.quality ?? "",
        weight: l.weight ?? 0,
        unitName: l.unitName ?? "",
        priceEur: l.priceEur ?? 0,
        qtyAccounting: l.qtyAccounting ?? 0,
        qtyActual: l.qtyActual ?? 0,
      })),
    };
    return (
      <div className="mx-auto max-w-none space-y-4">
        <div className="text-sm">
          <Link
            href={`/manager/stock-documents/${meta.slug}/${id}`}
            className="text-gray-500 hover:text-gray-800 hover:underline"
          >
            ← Назад до документа
          </Link>
        </div>
        <h1 className="text-xl font-semibold">
          Редагування: {doc.number1C ?? doc.docNumber}
        </h1>
        <InventoryForm initial={initial} />
      </div>
    );
  }

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

  const rows: StockDocInitialRow[] = doc.lines.map((l) => ({
    productId: l.productId,
    productName: l.productName ?? "",
    barcode: l.barcode ?? "",
    weight: num(l.weight),
    quantity: l.quantity ? String(l.quantity) : "1",
    priceEur: num(l.priceEur),
    role: l.role === "assembled" ? "assembled" : "disassembled",
    qtyAccounting: num(l.qtyAccounting),
    qtyActual: num(l.qtyActual),
    sourceLotId: l.sourceLotId ?? null,
    supplierName: l.supplierName ?? null,
    salePriceEur: num(l.salePriceEur),
    sectorId: l.sectorId ?? "",
  }));

  const initial: StockDocInitial = {
    id: doc.id,
    docDate: doc.docDate.toISOString().slice(0, 10),
    notes: doc.notes ?? "",
    customerName: doc.customerName ?? "",
    supplierName: doc.supplierName ?? "",
    reason: doc.reason ?? "",
    rows,
  };

  return (
    <div
      className={`mx-auto space-y-4 ${isRepacking ? "max-w-none" : "max-w-4xl"}`}
    >
      <div className="text-sm">
        <Link
          href={`/manager/stock-documents/${meta.slug}/${id}`}
          className="text-gray-500 hover:text-gray-800 hover:underline"
        >
          ← Назад до документа
        </Link>
      </div>
      <h1 className="text-xl font-semibold">
        Редагування: {doc.number1C ?? doc.docNumber}
      </h1>
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
        initial={initial}
      />
    </div>
  );
}
