import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import {
  mobileNotificationTokenSchema,
  mobileVideoSubscriptionSchema,
} from "@/lib/validations";
import { requireMobileSession } from "@/lib/mobile-auth";

/**
 * Mobile notifications & video subscriptions. customerId is always derived from the bearer token.
 *
 * GET    /api/mobile/notifications — list push tokens + video subscriptions + in-app notification feed
 * POST   /api/mobile/notifications { action: "register_token" | "subscribe_video", ... }
 * PUT    /api/mobile/notifications { notificationId? } — mark single (by id) or all unread as read
 * DELETE /api/mobile/notifications { action: "unregister_token" | "unsubscribe_video", ... }
 */

export async function GET(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const [pushTokens, videoSubscriptions, notifications] = await Promise.all([
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
    prisma.notification.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        payload: true,
        readAt: true,
        createdAt: true,
      },
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
    notifications,
  });
}

export async function POST(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  // Register push token
  if (action === "register_token") {
    const tokenParsed = mobileNotificationTokenSchema.safeParse({
      ...body,
      customerId,
    });
    if (!tokenParsed.success) {
      return NextResponse.json(
        { error: tokenParsed.error.issues[0]?.message ?? "Невірні дані" },
        { status: 400 },
      );
    }
    const { token, platform } = tokenParsed.data;

    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      create: { customerId, token, platform },
      update: { customerId, platform, active: true },
    });

    return NextResponse.json({ id: pushToken.id }, { status: 201 });
  }

  // Subscribe to video reviews
  if (action === "subscribe_video") {
    const subParsed = mobileVideoSubscriptionSchema.safeParse({
      ...body,
      customerId,
    });
    if (!subParsed.success) {
      return NextResponse.json(
        { error: subParsed.error.issues[0]?.message ?? "Невірні дані" },
        { status: 400 },
      );
    }
    const { productId } = subParsed.data;

    const subscription = await prisma.videoSubscription.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId },
      update: {},
    });

    return NextResponse.json({ id: subscription.id }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PUT(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const body = await request
    .json()
    .catch(() => ({}) as Record<string, unknown>);
  const notificationId =
    typeof body.notificationId === "string" ? body.notificationId : undefined;

  if (notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, customerId, readAt: null },
      data: { readAt: new Date() },
    });
  } else {
    await prisma.notification.updateMany({
      where: { customerId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action as string;

  // Unregister push token — scoped to this customer
  if (action === "unregister_token") {
    const token = body.token as string;
    if (token) {
      await prisma.pushToken.updateMany({
        where: { token, customerId },
        data: { active: false },
      });
    }
    return NextResponse.json({ success: true });
  }

  // Unsubscribe from video reviews
  if (action === "unsubscribe_video") {
    const productId =
      typeof body.productId === "string" ? body.productId : undefined;
    if (productId) {
      await prisma.videoSubscription.deleteMany({
        where: { customerId, productId },
      });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
