import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const [
    statuses,
    channels,
    categories,
    deliveries,
    assortmentCodes,
    routes,
    priceTypes,
  ] = await Promise.all([
    prisma.mgrClientStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrSearchChannel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrCategoryTT.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrDeliveryMethod.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrAssortmentCode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrRoute.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.mgrPriceType.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const response = NextResponse.json({
    statuses: statuses.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.label,
      colorHex: s.colorHex,
    })),
    channels: channels.map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
    })),
    categories: categories.map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
    })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      code: d.code,
      label: d.label,
    })),
    assortmentCodes: assortmentCodes.map((a) => ({
      id: a.id,
      code: a.code,
      label: a.label,
    })),
    routes: routes.map((r) => ({ id: r.id, name: r.name })),
    priceTypes: priceTypes.map((p) => ({
      id: p.id,
      code: p.code,
      label: p.label,
    })),
  });
  response.headers.set(
    "Cache-Control",
    "private, max-age=60, stale-while-revalidate=60",
  );
  return response;
}
