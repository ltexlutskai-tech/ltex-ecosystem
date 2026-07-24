import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { loadProductAttributeOptions } from "@/lib/manager/product-attributes";
import { AutoRefresh } from "../../_components/auto-refresh";
import {
  VideoTaskDetail,
  type VideoTaskView,
} from "./_components/video-task-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Відеозона — L-TEX Manager" };

export default async function VideoTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const task = await prisma.mgrVideoTask.findUnique({
    where: { id },
    include: { bags: { orderBy: { createdAt: "asc" } } },
  });
  if (!task) notFound();

  const attrs = await loadProductAttributeOptions();

  const view: VideoTaskView = {
    id: task.id,
    status: task.status,
    managerName: task.managerName,
    clientName: task.clientName,
    productName: task.productName,
    articleCode: task.articleCode,
    quantity: task.quantity,
    requestedBarcode: task.requestedBarcode,
    assignedName: task.assignedName,
    season: task.season,
    quality: task.quality,
    gender: task.gender,
    sizes: task.sizes,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    bags: task.bags.map((b) => ({
      id: b.id,
      status: b.status,
      barcode: b.barcode,
      weight: b.weight,
      unitsCount: b.unitsCount,
      unitWeight: b.unitWeight,
      lotWeightKg: b.lotWeightKg,
      videoUrl: b.videoUrl,
      youtubeDescription: b.youtubeDescription,
    })),
  };

  // Вилучати може той, хто створив (менеджер-замовник), або admin/owner.
  const canDelete =
    user.role === "admin" ||
    user.role === "owner" ||
    (task.managerUserId != null && task.managerUserId === user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <AutoRefresh />
      <VideoTaskDetail
        task={view}
        role={user.role}
        canDelete={canDelete}
        seasonOptions={attrs.seasons}
        qualityOptions={attrs.quality}
        genderOptions={attrs.genders}
      />
    </div>
  );
}
