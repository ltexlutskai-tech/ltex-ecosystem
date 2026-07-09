import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { updateBagStateChange } from "@/lib/manager/bag-state";
import {
  isBeforeToday,
  removeBagStateChange,
} from "@/lib/manager/bag-state-hooks";
import { updateBagStateSchema } from "@/lib/validations/bag-state";
import { BAG_STATE_WRITE_ROLES } from "../route";

/**
 * Документ «Зміна стану мішка» — картка.
 *  GET    — перегляд (усі менеджерські ролі);
 *  PATCH  — редагування чернетки (склад/адмін/власник; гард сьогоднішнього дня);
 *  DELETE — видалення + реверс журналу історії за реєстратором.
 */

const ELEVATED_ROLES = ["admin", "owner"] as const;

function isWrite(role: string): boolean {
  return (BAG_STATE_WRITE_ROLES as readonly string[]).includes(role);
}

function isElevated(role: string): boolean {
  return (ELEVATED_ROLES as readonly string[]).includes(role);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const { id } = await params;
  const doc = await prisma.bagStateChange.findUnique({
    where: { id },
    include: { items: { orderBy: { lineNo: "asc" } } },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  return NextResponse.json({
    id: doc.id,
    docNumber: doc.docNumber,
    number1C: doc.number1C,
    docDate: doc.docDate.toISOString(),
    status: doc.status,
    notes: doc.notes,
    postedAt: doc.postedAt ? doc.postedAt.toISOString() : null,
    items: doc.items.map((i) => ({
      id: i.id,
      lineNo: i.lineNo,
      lotId: i.lotId,
      barcode: i.barcode,
      productId: i.productId,
      isOpen: i.isOpen,
      hasVideo: i.hasVideo,
      isTarget: i.isTarget,
      youtubeUrl: i.youtubeUrl,
      description: i.description,
      comment: i.comment,
      onAir: i.onAir,
      onAirDelivery: i.onAirDelivery,
      reservedAgentUserId: i.reservedAgentUserId,
      reservedClientId: i.reservedClientId,
      reservedUntil: i.reservedUntil ? i.reservedUntil.toISOString() : null,
      sector: i.sector,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!isWrite(user.role)) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const { id } = await params;
  const doc = await prisma.bagStateChange.findUnique({
    where: { id },
    select: { id: true, status: true, docDate: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  if (doc.status !== "draft") {
    return NextResponse.json(
      { error: "Проведений документ не редагується" },
      { status: 409 },
    );
  }
  // Гард «сьогоднішній документ» — пом'якшений (виняток для admin/owner).
  if (isBeforeToday(doc.docDate) && !isElevated(user.role)) {
    return NextResponse.json(
      { error: "Можна редагувати лише сьогоднішній документ" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updateBagStateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Невірні дані",
        details: parsed.error.issues.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const updated = await updateBagStateChange(id, parsed.data);
  return NextResponse.json({ id: updated.id, docNumber: updated.docNumber });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!isWrite(user.role)) {
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  }
  const { id } = await params;
  const doc = await prisma.bagStateChange.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  }
  // Реверс журналу історії за реєстратором (стан лотів НЕ відкочуємо).
  await removeBagStateChange(id);
  await prisma.bagStateChange.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
