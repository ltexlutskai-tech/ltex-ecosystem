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

  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Нове поступлення</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          Скануйте штрихкоди / введіть вручну / генеруйте нові. Рядок = один
          мішок (штрихкод унікальний).
        </p>
      </div>
      <ReceivingForm
        suppliers={suppliers}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouse?.id ?? warehouses[0]?.id ?? ""}
        userRole={user.role}
      />
    </div>
  );
}
