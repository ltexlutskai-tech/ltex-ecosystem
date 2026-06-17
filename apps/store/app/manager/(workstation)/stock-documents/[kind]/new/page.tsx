import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { isStockDocKind } from "@/lib/manager/stock-documents-api";
import { getStockDocMeta } from "@/lib/manager/stock-documents";
import { StockDocForm } from "../../_components/stock-doc-form";

export const dynamic = "force-dynamic";

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
  const meta = getStockDocMeta(kind);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
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
        isRepacking={kind === "repackings"}
        isInventory={kind === "inventories"}
        showCustomer={kind === "product-returns"}
        showSupplier={kind === "supplier-returns"}
      />
    </div>
  );
}
