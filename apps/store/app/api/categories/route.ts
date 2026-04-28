import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export const revalidate = 300;

/**
 * Public categories listing for the mobile filter sheet.
 *
 *  - GET /api/categories                → top-level categories (parentId null)
 *  - GET /api/categories?parent=<slug>  → direct children of the given parent
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parentSlug = searchParams.get("parent");

  if (parentSlug) {
    const parent = await prisma.category.findUnique({
      where: { slug: parentSlug },
      include: {
        children: {
          orderBy: { position: "asc" },
          select: { id: true, slug: true, name: true, parentId: true },
        },
      },
    });
    return NextResponse.json({ categories: parent?.children ?? [] });
  }

  const categories = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { position: "asc" },
    select: { id: true, slug: true, name: true, parentId: true },
  });

  return NextResponse.json({ categories });
}
