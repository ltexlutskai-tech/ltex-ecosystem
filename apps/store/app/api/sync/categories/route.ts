import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { syncCategoriesSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`sync-categories:${ip}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncCategoriesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const cats = parsed.data;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  // Pass 1: upsert without parent links so child + parent can come in any
  // order within the same batch.
  for (const c of cats) {
    try {
      const existing = await prisma.category.findUnique({
        where: { slug: c.slug },
      });
      const data = {
        name: c.name,
        position: c.position ?? 0,
      };
      let action: "create" | "update";
      if (existing) {
        await prisma.category.update({ where: { slug: c.slug }, data });
        updated++;
        action = "update";
      } else {
        await prisma.category.create({ data: { ...data, slug: c.slug } });
        created++;
        action = "create";
      }
      await prisma.syncLog.create({
        data: {
          entity: "category",
          entityId: c.slug,
          action,
          payload: JSON.parse(JSON.stringify(c)),
        },
      });
    } catch (err) {
      errors.push(
        `Failed: ${c.slug} — ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  // Pass 2: resolve parent links once every category exists.
  for (const c of cats) {
    if (!c.parentSlug) continue;
    try {
      const child = await prisma.category.findUnique({
        where: { slug: c.slug },
      });
      const parent = await prisma.category.findUnique({
        where: { slug: c.parentSlug },
      });
      if (!child) continue;
      if (!parent) {
        errors.push(`Parent not found: ${c.parentSlug} (child: ${c.slug})`);
        continue;
      }
      if (child.parentId !== parent.id) {
        await prisma.category.update({
          where: { slug: c.slug },
          data: { parentId: parent.id },
        });
      }
    } catch (err) {
      errors.push(
        `Parent link failed: ${c.slug} → ${c.parentSlug} — ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath("/catalog", "layout");
  }

  return NextResponse.json({
    created,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: cats.length,
  });
}
