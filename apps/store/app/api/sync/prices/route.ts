import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { syncPricesSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`sync-prices:${ip}`, { windowMs: 60_000, max: 10 });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncPricesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const prices = parsed.data;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const p of prices) {
    try {
      const product = await prisma.product.findUnique({
        where: { code1C: p.productCode1C },
      });
      if (!product) {
        errors.push(`Product not found: ${p.productCode1C}`);
        continue;
      }

      const validFrom = p.validFrom ? new Date(p.validFrom) : new Date();
      const existing = await prisma.price.findFirst({
        where: { productId: product.id, priceType: p.priceType, validFrom },
      });
      const data = {
        amount: p.amount,
        currency: p.currency ?? "EUR",
        validTo: p.validTo ? new Date(p.validTo) : null,
      };

      let action: "create" | "update";
      if (existing) {
        await prisma.price.update({ where: { id: existing.id }, data });
        updated++;
        action = "update";
      } else {
        await prisma.price.create({
          data: {
            productId: product.id,
            priceType: p.priceType,
            validFrom,
            ...data,
          },
        });
        created++;
        action = "create";
      }

      await prisma.syncLog.create({
        data: {
          entity: "price",
          entityId: `${p.productCode1C}:${p.priceType}`,
          action,
          payload: JSON.parse(JSON.stringify(p)),
        },
      });
    } catch (err) {
      errors.push(
        `Failed: ${p.productCode1C}/${p.priceType} — ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath("/catalog", "layout");
    revalidatePath("/lots");
  }

  return NextResponse.json({
    created,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: prices.length,
  });
}
