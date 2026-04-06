import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";

/**
 * GET /api/mobile/shipments?customerId=xxx
 * Returns all shipments for the customer's orders.
 *
 * GET /api/mobile/shipments?trackingNumber=xxx
 * Track a specific shipment via Nova Poshta API.
 *
 * POST /api/mobile/shipments — create shipment (admin/manager)
 * Body: { orderId, trackingNumber, carrier?, recipientCity?, recipientBranch? }
 */

const NOVA_POSHTA_API = "https://api.novaposhta.ua/v2.0/json/";

interface NovaPoshtaStatus {
  Status: string;
  StatusCode: string;
  ScheduledDeliveryDate: string;
  RecipientAddress: string;
}

async function trackNovaPoshta(trackingNumber: string): Promise<NovaPoshtaStatus | null> {
  const apiKey = process.env.NOVA_POSHTA_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(NOVA_POSHTA_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        modelName: "TrackingDocument",
        calledMethod: "getStatusDocuments",
        methodProperties: {
          Documents: [{ DocumentNumber: trackingNumber }],
        },
      }),
    });

    const data = await res.json();
    if (data.success && data.data?.[0]) {
      return data.data[0] as NovaPoshtaStatus;
    }
  } catch {
    console.error(`Nova Poshta tracking error for ${trackingNumber}`);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId");
  const trackingNumber = request.nextUrl.searchParams.get("trackingNumber");

  // Track specific shipment
  if (trackingNumber) {
    const shipment = await prisma.shipment.findFirst({
      where: { trackingNumber },
      include: { order: { select: { id: true, code1C: true, status: true, totalEur: true } } },
    });

    // Try to get fresh status from Nova Poshta
    const npStatus = await trackNovaPoshta(trackingNumber);
    if (npStatus && shipment) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status: npStatus.StatusCode,
          statusText: npStatus.Status,
          estimatedDate: npStatus.ScheduledDeliveryDate
            ? new Date(npStatus.ScheduledDeliveryDate)
            : undefined,
          lastCheckedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      shipment: shipment
        ? {
            id: shipment.id,
            trackingNumber: shipment.trackingNumber,
            carrier: shipment.carrier,
            status: npStatus?.StatusCode ?? shipment.status,
            statusText: npStatus?.Status ?? shipment.statusText,
            estimatedDate: npStatus?.ScheduledDeliveryDate ?? shipment.estimatedDate,
            recipientCity: shipment.recipientCity,
            recipientBranch: shipment.recipientBranch,
            order: shipment.order,
            lastCheckedAt: new Date(),
          }
        : null,
      novaPoshtaStatus: npStatus,
    });
  }

  // Get all shipments for customer
  if (!customerId) {
    return NextResponse.json({ error: "customerId or trackingNumber required" }, { status: 400 });
  }

  const shipments = await prisma.shipment.findMany({
    where: { order: { customerId } },
    include: { order: { select: { id: true, code1C: true, status: true, totalEur: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    shipments: shipments.map((s) => ({
      id: s.id,
      trackingNumber: s.trackingNumber,
      carrier: s.carrier,
      status: s.status,
      statusText: s.statusText,
      estimatedDate: s.estimatedDate,
      recipientCity: s.recipientCity,
      recipientBranch: s.recipientBranch,
      lastCheckedAt: s.lastCheckedAt,
      order: s.order,
      createdAt: s.createdAt,
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

  const { orderId, trackingNumber, carrier, recipientCity, recipientBranch } = body as {
    orderId: string;
    trackingNumber: string;
    carrier?: string;
    recipientCity?: string;
    recipientBranch?: string;
  };

  if (!orderId || !trackingNumber) {
    return NextResponse.json({ error: "orderId and trackingNumber required" }, { status: 400 });
  }

  const shipment = await prisma.shipment.upsert({
    where: { orderId_trackingNumber: { orderId, trackingNumber } },
    create: {
      orderId,
      trackingNumber,
      carrier: carrier ?? "nova_poshta",
      recipientCity: recipientCity ?? null,
      recipientBranch: recipientBranch ?? null,
    },
    update: {
      recipientCity: recipientCity ?? undefined,
      recipientBranch: recipientBranch ?? undefined,
    },
  });

  return NextResponse.json({ id: shipment.id }, { status: 201 });
}
