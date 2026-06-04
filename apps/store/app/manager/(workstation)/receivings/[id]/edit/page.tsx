import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { ReceivingForm } from "../../_components/receiving-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Редагування поступлення | L-TEX" };

/**
 * Сторінка редагування чернетки поступлення (← правки 2026-06-05).
 *
 * Тільки для status='draft'. Posted/cancelled — редагувати не можна
 * (тільки скасувати + створити новий). Admin/owner може редагувати
 * до проведення; warehouse — теж до проведення.
 *
 * Використовує той самий `ReceivingForm` як create-сторінка, але з
 * прокинутим `initial`-стейтом і режимом PATCH.
 */
export default async function EditReceivingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole(["warehouse", "admin", "owner"]);
  if (!user) notFound();
  const { id } = await params;

  const [doc, suppliers, warehouses, defaultWarehouse] = await Promise.all([
    prisma.receiving.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            product: { select: { name: true, articleCode: true } },
          },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isDefault: true },
    }),
    prisma.warehouse.findFirst({
      where: { isActive: true, isDefault: true },
      select: { id: true },
    }),
  ]);

  if (!doc) notFound();
  if (doc.status !== "draft") {
    // Posted/cancelled — редагувати заборонено, повертаємо на детальну
    redirect(`/manager/receivings/${id}`);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <div>
        <h1 className="text-xl font-semibold">
          Редагування чернетки {doc.docNumber}
        </h1>
        <p className="mt-0.5 text-xs text-gray-500">
          Внесіть зміни і збережіть. Адміністратор/власник перевірить і проведе
          документ.
        </p>
      </div>
      <ReceivingForm
        suppliers={suppliers}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouse?.id ?? warehouses[0]?.id ?? ""}
        userRole={user.role}
        initial={{
          id: doc.id,
          supplierId: doc.supplierId,
          warehouseId: doc.warehouseId,
          docDate: doc.docDate.toISOString().slice(0, 10),
          notes: doc.notes ?? "",
          items: doc.items.map((it) => ({
            productId: it.productId,
            productName: it.product.name,
            articleCode: it.product.articleCode,
            weight: it.weight,
            purchasePrice: it.purchasePrice,
            salePrice: it.salePrice ?? 0,
            barcode: it.barcode ?? "",
            barcodeSource: it.barcodeSource as
              | "scanned"
              | "manual"
              | "generated",
            sector: it.sector ?? "",
          })),
        }}
      />
    </div>
  );
}
