import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getScanSheetList } from "@/lib/delivery/nova-poshta";
import { AutoRefresh } from "../_components/auto-refresh";
import {
  NpRegistersClient,
  type RegistrableTtn,
} from "./_components/np-registers-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Реєстри НП — L-TEX Manager" };

const WAREHOUSE_ROLES = ["warehouse", "admin", "owner"];

export default async function NpRegistersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  if (!WAREHOUSE_ROLES.includes(user.role)) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-gray-600">Недостатньо прав.</p>
      </div>
    );
  }

  const [registers, sales] = await Promise.all([
    getScanSheetList(),
    prisma.sale.findMany({
      where: {
        ttnRef: { not: null },
        markedForDeletion: false,
        warehouseTask: { status: "sent" },
      },
      orderBy: { ttnCreatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        expressWaybill: true,
        ttnRef: true,
        npCityName: true,
        npWarehouseName: true,
        ttnCreatedAt: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const registrable: RegistrableTtn[] = sales
    .filter((s): s is typeof s & { ttnRef: string } => s.ttnRef !== null)
    .map((s) => ({
      saleId: s.id,
      ttnRef: s.ttnRef,
      expressWaybill: s.expressWaybill,
      npCityName: s.npCityName,
      npWarehouseName: s.npWarehouseName,
      ttnCreatedAt: s.ttnCreatedAt ? s.ttnCreatedAt.toISOString() : null,
      customerName: s.customer?.name ?? null,
    }));

  return (
    <div className="space-y-4 px-4 py-4">
      <AutoRefresh intervalMs={30_000} />
      <h1 className="mx-auto max-w-5xl text-lg font-semibold text-gray-900">
        Реєстри відправлень Нової Пошти
      </h1>
      <NpRegistersClient registrable={registrable} registers={registers} />
    </div>
  );
}
