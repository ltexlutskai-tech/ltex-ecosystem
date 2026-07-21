import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { formatDocNumber } from "@/lib/manager/order-number";
import { getTtnStatus } from "@/lib/delivery/nova-poshta";
import { buildSuggestedSeats } from "@/lib/manager/warehouse-seat-suggest";
import { AutoRefresh } from "../../_components/auto-refresh";
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
      seats: { orderBy: { position: "asc" } },
      sale: {
        select: {
          id: true,
          markedForDeletion: true,
          number1C: true,
          code1C: true,
          docNumber: true,
          ttnRef: true,
          expressWaybill: true,
          cashOnDelivery: true,
          npCityRef: true,
          npCityName: true,
          npWarehouseRef: true,
          npWarehouseName: true,
          checkboxReceipt: {
            select: { status: true, error: true },
          },
        },
      },
    },
  });
  if (!task) notFound();
  // Реалізацію видалено «у себе» менеджером — завдання зникає для всіх.
  if (task.sale?.markedForDeletion) notFound();

  // Склад/адмін/власник — усі; менеджер — лише свої завдання.
  const isWarehouse = WAREHOUSE_ROLES.includes(user.role);
  if (!isWarehouse && task.managerUserId !== user.id) notFound();

  const saleNumber = task.sale ? formatDocNumber(task.sale) : "—";

  // Пропоновані місця з габаритів карток товарів (склад перевіряє/коригує).
  const suggestedSeats = buildSuggestedSeats(
    task.items.map((it) => ({
      weight: it.weight,
      packaging: it.packaging,
      defaultLengthCm: it.defaultLengthCm,
      defaultWidthCm: it.defaultWidthCm,
      defaultHeightCm: it.defaultHeightCm,
    })),
  );

  // Якщо реалізація має ТТН НП — дізнаємось, чи це ще «Чернетка» (draft).
  // Поки чернетка — склад може правити габарити й друкувати етикетку навіть
  // на вже відправленому завданні; коли ТТН у дорозі — місця read-only.
  let ttnDraft = false;
  let ttnStatusText: string | null = null;
  if (task.sale?.ttnRef && task.sale?.expressWaybill) {
    try {
      const status = await getTtnStatus(task.sale.expressWaybill);
      if (status) {
        ttnDraft = status.isDraft;
        ttnStatusText = status.status;
      }
    } catch {
      // Мережевий збій НП — трактуємо як «невідомо»: місця лишаються read-only.
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AutoRefresh intervalMs={15_000} />
      <Link
        href="/manager/warehouse-tasks"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до завдань
      </Link>

      <WarehouseTaskClient
        canAct={isWarehouse}
        ttnDraft={ttnDraft}
        ttnStatusText={ttnStatusText}
        suggestedSeats={suggestedSeats}
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
          labelPrintedAt: task.labelPrintedAt?.toISOString() ?? null,
          saleId: task.sale?.id ?? null,
          saleNumber,
          saleTtnRef: task.sale?.ttnRef ?? null,
          saleExpressWaybill: task.sale?.expressWaybill ?? null,
          saleCashOnDelivery: task.sale?.cashOnDelivery ?? false,
          npCityRef: task.sale?.npCityRef ?? null,
          npCityName: task.sale?.npCityName ?? null,
          npWarehouseRef: task.sale?.npWarehouseRef ?? null,
          npWarehouseName: task.sale?.npWarehouseName ?? null,
          receiptStatus: task.sale?.checkboxReceipt?.status ?? null,
          receiptError: task.sale?.checkboxReceipt?.error ?? null,
          seats: task.seats.map((s) => ({
            id: s.id,
            weight: s.weight,
            lengthCm: s.lengthCm,
            widthCm: s.widthCm,
            heightCm: s.heightCm,
            manualHandling: s.manualHandling,
            note: s.note,
          })),
          items: task.items.map((it) => ({
            id: it.id,
            productName: it.productName,
            articleCode: it.articleCode,
            barcode: it.barcode,
            sector: it.sector,
            quantity: it.quantity,
            weight: it.weight,
            packed: it.packed,
            packaging: it.packaging,
          })),
        }}
      />
    </div>
  );
}
