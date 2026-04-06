import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const products: Array<{
    code1C: string;
    articleCode?: string;
    name: string;
    slug: string;
    categorySlug: string;
    description?: string;
    quality: string;
    season?: string;
    country: string;
    priceUnit?: string;
    averageWeight?: number;
    videoUrl?: string;
    inStock?: boolean;
  }> = await request.json();

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const p of products) {
    try {
      const category = await prisma.category.findUnique({
        where: { slug: p.categorySlug },
      });
      if (!category) {
        errors++;
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
        videoUrl: p.videoUrl ?? null,
        articleCode: p.articleCode ?? null,
        inStock: p.inStock ?? true,
      };

      if (existing) {
        await prisma.product.update({
          where: { code1C: p.code1C },
          data,
        });
        updated++;
      } else {
        await prisma.product.create({
          data: { ...data, code1C: p.code1C },
        });
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
    } catch {
      errors++;
    }
  }

  return NextResponse.json({ created, updated, errors, total: products.length });
}
