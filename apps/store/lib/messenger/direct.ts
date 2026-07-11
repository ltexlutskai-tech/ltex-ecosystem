import { Prisma, prisma } from "@ltex/db";

/**
 * Детермінований ключ особистого (1-на-1) чату: відсортована пара user.id через
 * ":". Гарантує рівно один direct-чат на пару людей незалежно від того, хто
 * почав розмову.
 */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/**
 * Знаходить наявний або створює новий особистий чат між `currentUserId` та
 * `otherUserId`. Повертає id розмови.
 *
 * Кидає:
 * - `Error("self")` — якщо це той самий користувач;
 * - `Error("not_found")` — якщо співрозмовника нема / він неактивний.
 */
export async function getOrCreateDirectConversation(
  currentUserId: string,
  otherUserId: string,
): Promise<string> {
  if (currentUserId === otherUserId) {
    throw new Error("self");
  }

  const other = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, isActive: true },
  });
  if (!other || !other.isActive) {
    throw new Error("not_found");
  }

  const directKey = directKeyFor(currentUserId, otherUserId);

  const existing = await prisma.messengerConversation.findUnique({
    where: { directKey },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await prisma.messengerConversation.create({
      data: {
        type: "direct",
        directKey,
        createdById: currentUserId,
        members: {
          create: [{ userId: currentUserId }, { userId: otherUserId }],
        },
      },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    // Гонка: інший запит створив цей чат між findUnique і create.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const again = await prisma.messengerConversation.findUnique({
        where: { directKey },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw err;
  }
}
