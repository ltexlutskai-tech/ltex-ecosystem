import { notFound, redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { AutoRefresh } from "../../_components/auto-refresh";
import {
  VideoTaskDetail,
  type VideoTaskView,
} from "./_components/video-task-detail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Відеозавдання — L-TEX Manager" };

export default async function VideoTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const task = await prisma.mgrVideoTask.findUnique({ where: { id } });
  if (!task) notFound();

  const view: VideoTaskView = {
    id: task.id,
    status: task.status,
    managerName: task.managerName,
    clientName: task.clientName,
    productName: task.productName,
    articleCode: task.articleCode,
    quantity: task.quantity,
    barcode: task.barcode,
    requestedBarcode: task.requestedBarcode,
    assignedName: task.assignedName,
    videoUrl: task.videoUrl,
    youtubeDescription: task.youtubeDescription,
    season: task.season,
    quality: task.quality,
    gender: task.gender,
    sizes: task.sizes,
    unitsCount: task.unitsCount,
    unitWeight: task.unitWeight,
    lotWeightKg: task.lotWeightKg,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <AutoRefresh />
      <VideoTaskDetail task={view} role={user.role} />
    </div>
  );
}
