import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { ReceivingForm } from "../_components/receiving-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нове поступлення | L-TEX Manager" };

export default async function NewReceivingPage() {
  const user = await requireRole(["warehouse", "admin", "owner"]);
  if (!user) notFound();

  const [suppliers, warehouses, defaultWarehouse] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, currency: true },
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

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Нове поступлення</h1>
        <p className="mt-1 text-sm text-gray-500">
          Створіть документ-чернетку, додайте рядки, потім проведіть. Після
          проведення у Прайсі з&apos;являться нові лоти.
        </p>
      </div>
      <ReceivingForm
        suppliers={suppliers}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouse?.id ?? warehouses[0]?.id ?? ""}
      />
    </div>
  );
}
