import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  computeLoadingBoard,
  computeRouteSheetCounters,
  getRouteSheetLoadingRows,
} from "@/lib/manager/route-sheet-loading";
import { formatDocNumber } from "@/lib/manager/order-number";
import {
  WarehouseLoadingClient,
  type WarehouseLoadingView,
} from "./_components/warehouse-loading-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: { code1C: true, number1C: true, docNumber: true },
  });
  return {
    title: sheet
      ? `Завантаження ${formatDocNumber(sheet)} — L-TEX`
      : "Завантаження маршруту — L-TEX",
  };
}

export default async function WarehouseLoadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;

  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    select: {
      id: true,
      code1C: true,
      number1C: true,
      docNumber: true,
      status: true,
      comment: true,
      arrivalDate: true,
    },
  });
  if (!sheet) notFound();

  const [board, loading, counters] = await Promise.all([
    computeLoadingBoard(sheet.id),
    getRouteSheetLoadingRows(sheet.id),
    computeRouteSheetCounters(sheet.id),
  ]);

  const initial: WarehouseLoadingView = {
    id: sheet.id,
    displayNumber: formatDocNumber(sheet),
    status: sheet.status,
    routeName: sheet.comment,
    arrivalDate: sheet.arrivalDate ? sheet.arrivalDate.toISOString() : null,
    board,
    loading,
    counters,
  };

  return (
    <div className="py-2">
      <WarehouseLoadingClient initial={initial} />
    </div>
  );
}
