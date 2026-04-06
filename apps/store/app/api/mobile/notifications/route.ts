import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

/**
 * POST /api/mobile/notifications/register — Register push token
 * Body: { customerId, token, platform: "ios"|"android"|"web" }
 *
 * DELETE /api/mobile/notifications/register — Unregister push token
 * Body: { token }
 *
 * POST /api/mobile/notifications/subscribe-video — Subscribe to video reviews
 * Body: { customerId, productId }
 *
 * DELETE /api/mobile/notifications/subscribe-video — Unsubscribe
 * Body: { customerId, productId }
 *
 * GET /api/mobile/notifications?customerId=xxx — Get subscriptions
 */

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ error: "customerId required" }, { status: 400 });
  }

  const [pushTokens, videoSubscriptions] = await Promise.all([
    prisma.pushToken.findMany({
      where: { customerId, active: true },
      select: { id: true, platform: true, createdAt: true },
    }),
    prisma.videoSubscription.findMany({
      where: { customerId },
      include: {
        product: {
          select: { id: true, name: true, slug: true, videoUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    pushTokens,
    videoSubscriptions: videoSubscriptions.map((s) => ({
      id: s.id,
      productId: s.productId,
      productName: s.product.name,
      productSlug: s.product.slug,
      videoUrl: s.product.videoUrl,
      subscribedAt: s.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  // Register push token
  if (action === "register_token") {
    const { customerId, token, platform } = body as {
      customerId: string;
      token: string;
      platform: string;
    };

    if (!customerId || !token || !platform) {
      return NextResponse.json({ error: "customerId, token, platform required" }, { status: 400 });
    }

    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      create: { customerId, token, platform },
      update: { customerId, platform, active: true },
    });

    return NextResponse.json({ id: pushToken.id }, { status: 201 });
  }

  // Subscribe to video reviews
  if (action === "subscribe_video") {
    const { customerId, productId } = body as { customerId: string; productId: string };

    if (!customerId || !productId) {
      return NextResponse.json({ error: "customerId and productId required" }, { status: 400 });
    }

    const subscription = await prisma.videoSubscription.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId },
      update: {},
    });

    return NextResponse.json({ id: subscription.id }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  // Unregister push token
  if (action === "unregister_token") {
    const token = body.token as string;
    if (token) {
      await prisma.pushToken.updateMany({
        where: { token },
        data: { active: false },
      });
    }
    return NextResponse.json({ success: true });
  }

  // Unsubscribe from video reviews
  if (action === "unsubscribe_video") {
    const { customerId, productId } = body as { customerId: string; productId: string };
    if (customerId && productId) {
      await prisma.videoSubscription.deleteMany({ where: { customerId, productId } });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
