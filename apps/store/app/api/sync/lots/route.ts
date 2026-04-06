import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { syncLotsSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`sync-lots:${ip}`, { windowMs: 60_000, max: 10 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncLotsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const lots = parsed.data;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const lot of lots) {
    try {
      const product = await prisma.product.findFirst({
        where: { articleCode: lot.articleCode },
      });
      if (!product) {
        errors.push(`Product not found: ${lot.articleCode} (barcode: ${lot.barcode})`);
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
        videoUrl: lot.videoUrl || null,
      };

      if (existing) {
        await prisma.lot.update({ where: { barcode: lot.barcode }, data });
        updated++;
      } else {
        await prisma.lot.create({ data: { ...data, barcode: lot.barcode } });
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
    } catch (err) {
      errors.push(`Failed: ${lot.barcode} — ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath("/lots");
    revalidatePath("/catalog", "layout");
  }

  return NextResponse.json({
    created,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: lots.length,
  });
}
