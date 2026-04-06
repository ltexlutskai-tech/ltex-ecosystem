import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { z } from "zod";
import { syncProductSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const syncProductsSchema = z.array(syncProductSchema);

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 sync requests per minute
  const ip = getClientIp(request);
  const limit = rateLimit(`sync-products:${ip}`, { windowMs: 60_000, max: 10 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncProductsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const products = parsed.data;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const p of products) {
    try {
      const category = await prisma.category.findUnique({
        where: { slug: p.categorySlug },
      });
      if (!category) {
        errors.push(`Category not found: ${p.categorySlug} (product: ${p.code1C})`);
        continue;
      }

      const existing = await prisma.product.findUnique({
        where: { code1C: p.code1C },
      });

      const data = {
        name: p.name,
        slug: p.slug,
        categoryId: category.id,
        description: p.description ?? "",
        quality: p.quality,
        season: p.season ?? "",
        country: p.country,
        priceUnit: p.priceUnit ?? "kg",
        averageWeight: p.averageWeight ?? null,
        videoUrl: p.videoUrl || null,
        articleCode: p.articleCode ?? null,
        inStock: p.inStock ?? true,
      };

      if (existing) {
        await prisma.product.update({ where: { code1C: p.code1C }, data });
        updated++;
      } else {
        await prisma.product.create({ data: { ...data, code1C: p.code1C } });
        created++;
      }

      await prisma.syncLog.create({
        data: {
          entity: "product",
          entityId: p.code1C,
          action: existing ? "update" : "create",
          payload: JSON.parse(JSON.stringify(p)),
        },
      });
    } catch (err) {
      errors.push(`Failed: ${p.code1C} — ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // Revalidate catalog pages after sync
  if (created > 0 || updated > 0) {
    revalidatePath("/catalog", "layout");
  }

  return NextResponse.json({
    created,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: products.length,
  });
}
