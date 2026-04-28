import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { tryMobileSession } from "@/lib/mobile-auth";

const ALLOWED_SOURCES = [
  "home",
  "catalog",
  "search",
  "product_detail",
] as const;

/**
 * POST /api/mobile/products/[id]/view — fire-and-forget product view tracker.
 *
 * Auth optional: a valid Bearer token attaches the customerId, otherwise the
 * row is written with `customer_id = NULL` (anonymous). Always returns 204 to
 * avoid leaking product existence and to keep the client path fast.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: productId } = await params;
  const session = tryMobileSession(request);
  const customerId = session?.customerId ?? null;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const rawSource = typeof body.source === "string" ? body.source : "";
  const source = (ALLOWED_SOURCES as readonly string[]).includes(rawSource)
    ? rawSource
    : "unknown";

  const productExists = await prisma.product.count({
    where: { id: productId },
  });
  if (!productExists) {
    return new NextResponse(null, { status: 204 });
  }

  await prisma.viewLog.create({
    data: { customerId, productId, source },
  });

  return new NextResponse(null, { status: 204 });
}
