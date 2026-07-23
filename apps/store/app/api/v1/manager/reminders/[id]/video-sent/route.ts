import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { recordClientEventSafe } from "@/lib/manager/client-timeline";

/**
 * POST /api/v1/manager/reminders/[id]/video-sent
 *
 * Фіксує в історії роботи з клієнтом, що менеджер надіслав йому відеоогляд
 * (натиснув «Надіслати відео клієнту» → відкрив месенджер, або «Написати у
 * Viber»). Запис містить: артикул, назву товару, посилання на відео, штрихкод
 * і вагу лота — усе резолвиться на сервері з контексту нагадування.
 * Доступ: власник нагадування або admin. Ідемпотентність не критична (кожне
 * надсилання — окрема подія в історії).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const reminder = await prisma.mgrReminder.findUnique({
    where: { id },
    select: {
      id: true,
      ownerUserId: true,
      clientId: true,
      lotId: true,
      productId: true,
    },
  });
  if (!reminder) {
    return NextResponse.json(
      { error: "Нагадування не знайдено" },
      { status: 404 },
    );
  }
  if (reminder.ownerUserId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }
  if (!reminder.clientId) {
    // Немає клієнта — нікуди писати історію; не помилка.
    return NextResponse.json({ ok: true, logged: false });
  }

  // Резолвимо лот + товар для тексту запису.
  let productId = reminder.productId;
  let barcode: string | null = null;
  let weight: number | null = null;
  let videoUrl: string | null = null;

  if (reminder.lotId) {
    const lot = await prisma.lot.findUnique({
      where: { id: reminder.lotId },
      select: { productId: true, barcode: true, weight: true, videoUrl: true },
    });
    if (lot) {
      productId = lot.productId;
      barcode = lot.barcode;
      weight = lot.weight;
      videoUrl = lot.videoUrl;
    }
  }

  let productName: string | null = null;
  let articleCode: string | null = null;
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, articleCode: true, videoUrl: true },
    });
    if (product) {
      productName = product.name;
      articleCode = product.articleCode;
      videoUrl = videoUrl ?? product.videoUrl;
    }
  }

  const facts = [
    articleCode ? `арт. ${articleCode}` : null,
    barcode ? `ШК ${barcode}` : null,
    weight != null ? `${weight} кг` : null,
    videoUrl,
  ]
    .filter(Boolean)
    .join(" · ");

  recordClientEventSafe({
    clientId: reminder.clientId,
    kind: "comment",
    body: `Надіслано відеоогляд: ${productName ?? "товар"}${facts ? " — " + facts : ""}`,
    authorUserId: user.id,
    metadata: {
      reminderId: reminder.id,
      productId,
      lotId: reminder.lotId,
      barcode,
      weight,
      videoUrl,
      event: "video_sent",
    },
  });

  return NextResponse.json({ ok: true, logged: true });
}
