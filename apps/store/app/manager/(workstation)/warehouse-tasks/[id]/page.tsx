import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { formatDocNumber } from "@/lib/manager/order-number";
import { WarehouseTaskClient } from "./_components/task-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Завдання складу — L-TEX Manager" };

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

export default async function WarehouseTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");
  const { id } = await params;

  const task = await prisma.warehouseTask.findUnique({
    where: { id },
    include: {
      items: { orderBy: { productName: "asc" } },
      sale: {
        select: { id: true, number1C: true, code1C: true, docNumber: true },
      },
    },
  });
  if (!task) notFound();

  // Склад/адмін/власник — усі; менеджер — лише свої завдання.
  const isWarehouse = WAREHOUSE_ROLES.includes(user.role);
  if (!isWarehouse && task.managerUserId !== user.id) notFound();

  const saleNumber = task.sale ? formatDocNumber(task.sale) : "—";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/manager/warehouse-tasks"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до завдань
      </Link>

      <WarehouseTaskClient
        canAct={isWarehouse}
        task={{
          id: task.id,
          status: task.status,
          customerName: task.customerName,
          deliveryLabel: task.deliveryLabel,
          deliveryMethod: task.deliveryMethod,
          novaPoshtaBranch: task.novaPoshtaBranch,
          expressWaybill: task.expressWaybill,
          deliveryAddress: task.deliveryAddress,
          managerName: task.managerName,
          comment: task.comment,
          receivedByName: task.receivedByName,
          receivedAt: task.receivedAt?.toISOString() ?? null,
          sentByName: task.sentByName,
          sentAt: task.sentAt?.toISOString() ?? null,
          saleId: task.sale?.id ?? null,
          saleNumber,
          items: task.items.map((it) => ({
            id: it.id,
            productName: it.productName,
            articleCode: it.articleCode,
            barcode: it.barcode,
            sector: it.sector,
            quantity: it.quantity,
            weight: it.weight,
            packed: it.packed,
          })),
        }}
      />
    </div>
  );
}
