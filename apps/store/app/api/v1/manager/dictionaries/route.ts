import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/** ТЗ 8.0 B7: активні значення довідника (без архіву / позначки на вилучення). */
const DICT_SELECT_WHERE = {
  archived: false,
  markedForDeletion: false,
} as const;

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
    bankAccounts,
    cashFlowArticles,
  ] = await Promise.all([
    // ТЗ 8.0 B7: у списках вибору не показуємо заархівовані / позначені на
    // вилучення значення довідників.
    prisma.mgrClientStatus.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrSearchChannel.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrCategoryTT.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrDeliveryMethod.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrAssortmentCode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrRoute.findMany({
      where: { ...DICT_SELECT_WHERE, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.mgrPriceType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrBankAccount.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.mgrCashFlowArticle.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
    }),
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
    bankAccounts: bankAccounts.map((b) => ({
      id: b.id,
      name: b.name,
      hiddenInApp: b.hiddenInApp,
    })),
    cashFlowArticles: cashFlowArticles.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      parentId: a.parentId,
    })),
  });
  response.headers.set(
    "Cache-Control",
    "private, max-age=60, stale-while-revalidate=60",
  );
  return response;
}
