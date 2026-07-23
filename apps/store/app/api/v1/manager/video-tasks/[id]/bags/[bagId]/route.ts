import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { patchBagSchema } from "@/lib/validations/video-task";
import { removeVideoTaskBag } from "@/lib/manager/video-task";

/**
 * PATCH  /api/v1/manager/video-tasks/[id]/bags/[bagId] — відеозона зберігає
 *        характеристики мішка (к-сть/вага/відео). Гейт: відеозона/admin/owner.
 * DELETE /api/v1/manager/video-tasks/[id]/bags/[bagId] — склад прибирає мішок
 *        (не несе на відео) + знімає бронь. Гейт: склад/admin/owner.
 */

const FILM_ROLES = ["videozone", "admin", "owner"];
const BRING_ROLES = ["warehouse", "admin", "owner"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bagId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!FILM_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const { id, bagId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchBagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });
  }

  const bag = await prisma.mgrVideoTaskBag.findUnique({
    where: { id: bagId },
    select: { id: true, taskId: true, task: { select: { status: true } } },
  });
  if (!bag || bag.taskId !== id) {
    return NextResponse.json({ error: "Мішок не знайдено" }, { status: 404 });
  }
  if (bag.task.status === "done") {
    return NextResponse.json({ error: "Уже завершено" }, { status: 409 });
  }

  const d = parsed.data;
  const updated = await prisma.mgrVideoTaskBag.update({
    where: { id: bagId },
    data: {
      unitsCount: d.unitsCount ?? undefined,
      unitWeight: d.unitWeight ?? undefined,
      lotWeightKg: d.lotWeightKg ?? undefined,
      videoUrl: d.videoUrl ?? undefined,
    },
  });
  return NextResponse.json({ bag: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; bagId: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!BRING_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const { id, bagId } = await params;
  try {
    await removeVideoTaskBag({ taskId: id, bagId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "BAG_NOT_FOUND") {
      return NextResponse.json({ error: "Мішок не знайдено" }, { status: 404 });
    }
    if (msg === "NOT_COLLECTING") {
      return NextResponse.json(
        { error: "Мішки вже передано у відеозону" },
        { status: 409 },
      );
    }
    console.error("[L-TEX] remove video bag failed", { error: msg });
    return NextResponse.json({ error: "Не вдалося" }, { status: 500 });
  }
}
