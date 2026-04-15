import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireMobileSession } from "@/lib/mobile-auth";

/**
 * Mobile shipments. customerId is always derived from the bearer token.
 *
 * GET /api/mobile/shipments — all shipments for the authenticated customer.
 * GET /api/mobile/shipments?trackingNumber=xxx — track a specific shipment (must belong to the
 *     authenticated customer). Refreshes status from Nova Poshta.
 *
 * Shipment creation is an admin/1C responsibility — not exposed via mobile API anymore.
 */

const NOVA_POSHTA_API = "https://api.novaposhta.ua/v2.0/json/";

interface NovaPoshtaStatus {
  Status: string;
  StatusCode: string;
  ScheduledDeliveryDate: string;
  RecipientAddress: string;
}

async function trackNovaPoshta(
  trackingNumber: string,
): Promise<NovaPoshtaStatus | null> {
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
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const trackingNumber = request.nextUrl.searchParams.get("trackingNumber");

  // Track specific shipment — must belong to the authenticated customer
  if (trackingNumber) {
    const shipment = await prisma.shipment.findFirst({
      where: { trackingNumber, order: { customerId } },
      include: {
        order: {
          select: { id: true, code1C: true, status: true, totalEur: true },
        },
      },
    });

    if (!shipment) {
      return NextResponse.json(
        { error: "Shipment not found" },
        { status: 404 },
      );
    }

    // Try to get fresh status from Nova Poshta
    const npStatus = await trackNovaPoshta(trackingNumber);
    if (npStatus) {
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
      shipment: {
        id: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        status: npStatus?.StatusCode ?? shipment.status,
        statusText: npStatus?.Status ?? shipment.statusText,
        estimatedDate:
          npStatus?.ScheduledDeliveryDate ?? shipment.estimatedDate,
        recipientCity: shipment.recipientCity,
        recipientBranch: shipment.recipientBranch,
        order: shipment.order,
        lastCheckedAt: new Date(),
      },
      novaPoshtaStatus: npStatus,
    });
  }

  // List all shipments for the customer
  const shipments = await prisma.shipment.findMany({
    where: { order: { customerId } },
    include: {
      order: {
        select: { id: true, code1C: true, status: true, totalEur: true },
      },
    },
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
