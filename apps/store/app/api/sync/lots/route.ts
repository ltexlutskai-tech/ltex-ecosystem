import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lots: Array<{
    barcode: string;
    articleCode: string;
    weight: number;
    quantity?: number;
    status?: string;
    priceEur: number;
    videoUrl?: string;
  }> = await request.json();

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const lot of lots) {
    try {
      const product = await prisma.product.findFirst({
        where: { articleCode: lot.articleCode },
      });
      if (!product) {
        errors++;
        continue;
      }

      const existing = await prisma.lot.findUnique({
        where: { barcode: lot.barcode },
      });

      const data = {
        productId: product.id,
        weight: lot.weight,
        quantity: lot.quantity ?? 1,
        status: lot.status ?? "free",
        priceEur: lot.priceEur,
        videoUrl: lot.videoUrl ?? null,
      };

      if (existing) {
        await prisma.lot.update({
          where: { barcode: lot.barcode },
          data,
        });
        updated++;
      } else {
        await prisma.lot.create({
          data: { ...data, barcode: lot.barcode },
        });
        created++;
      }

      await prisma.syncLog.create({
        data: {
          entity: "lot",
          entityId: lot.barcode,
          action: existing ? "update" : "create",
          payload: JSON.parse(JSON.stringify(lot)),
        },
      });
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ created, updated, errors, total: lots.length });
}
