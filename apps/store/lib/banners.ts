import { prisma } from "@ltex/db";

export async function getActiveBanners() {
  return prisma.banner.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
  });
}
