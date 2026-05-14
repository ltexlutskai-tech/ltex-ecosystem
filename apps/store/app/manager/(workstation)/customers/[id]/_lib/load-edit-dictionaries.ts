import { prisma } from "@ltex/db";

export interface EditDictionaryOption {
  id: string;
  label: string;
}

export interface EditDictionaries {
  statuses: EditDictionaryOption[];
  searchChannels: EditDictionaryOption[];
  categoriesTT: EditDictionaryOption[];
  deliveryMethods: EditDictionaryOption[];
  assortmentCodes: EditDictionaryOption[];
  priceTypes: EditDictionaryOption[];
  routes: EditDictionaryOption[];
  agents: EditDictionaryOption[];
}

export async function loadEditDictionaries(): Promise<EditDictionaries> {
  const [
    statuses,
    channels,
    categories,
    deliveries,
    assortmentCodes,
    priceTypes,
    routes,
    agents,
  ] = await Promise.all([
    prisma.mgrClientStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrSearchChannel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrCategoryTT.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrDeliveryMethod.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrAssortmentCode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrPriceType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrRoute.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["manager", "admin"] }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
  ]);

  return {
    statuses: statuses.map((s) => ({ id: s.id, label: s.label })),
    searchChannels: channels.map((c) => ({ id: c.id, label: c.label })),
    categoriesTT: categories.map((c) => ({ id: c.id, label: c.label })),
    deliveryMethods: deliveries.map((d) => ({ id: d.id, label: d.label })),
    assortmentCodes: assortmentCodes.map((a) => ({
      id: a.id,
      label: a.label,
    })),
    priceTypes: priceTypes.map((p) => ({ id: p.id, label: p.label })),
    routes: routes.map((r) => ({ id: r.id, label: r.name })),
    agents: agents.map((u) => ({ id: u.id, label: u.fullName })),
  };
}
