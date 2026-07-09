/**
 * Сід базових статей руху коштів `MgrCashFlowArticle` з напрямом (`direction`).
 *
 * Ідемпотентний: для кожної статті шукає наявний запис по `name`
 * (`findFirst`) — якщо є, лишає як є; якщо немає, створює з потрібним
 * напрямом. Повторні запуски нічого не дублюють.
 *
 * ─── ГАРАНТІЇ БЕЗПЕКИ ─────────────────────────────────────────────────────────
 *   - Пише у ту базу, на яку вказує `DATABASE_URL` (спільний клієнт @ltex/db).
 *   - Якщо `DATABASE_URL` не заданий → м'яко виходимо (нічого не пишемо),
 *     як інші seed-скрипти при відсутності бази.
 *
 * ─── ЗАПУСК ───────────────────────────────────────────────────────────────────
 *   pnpm --filter @ltex/store exec tsx scripts/seed-cash-flow-articles.ts
 */

import { prisma } from "@ltex/db";

type Direction = "income" | "expense" | "both";

interface ArticleSeed {
  name: string;
  direction: Direction;
}

const ARTICLES: ArticleSeed[] = [
  { name: "Оплата від покупця", direction: "income" },
  { name: "Оплата доставки", direction: "income" },
  { name: "Повернення коштів покупцю", direction: "expense" },
];

const TAG = "[seed-cash-flow-articles]";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn(
      `${TAG} DATABASE_URL не заданий — пропускаємо (нічого не пишемо).`,
    );
    return;
  }

  let created = 0;
  let skipped = 0;
  for (const a of ARTICLES) {
    const existing = await prisma.mgrCashFlowArticle.findFirst({
      where: { name: a.name },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      console.log(`${TAG} пропущено (вже є): ${a.name}`);
      continue;
    }
    await prisma.mgrCashFlowArticle.create({
      data: { name: a.name, direction: a.direction },
    });
    created += 1;
    console.log(`${TAG} створено: ${a.name} (${a.direction})`);
  }

  console.log(`${TAG} готово: створено ${created}, пропущено ${skipped}.`);
}

main()
  .catch((err) => {
    console.error(`${TAG} помилка:`, err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
