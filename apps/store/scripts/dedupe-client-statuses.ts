/**
 * Прибирає дублікати довідника статусів клієнтів (`MgrClientStatus`).
 *
 * Причина дублів: два seed-скрипти писали ті самі назви під різними кодами —
 * тестовий (`active/low_active/inactive/potential/new`) і справжній 1С
 * (`000000001…`). Авто-статус (`recompute-client-statuses`) ставить ЛИШЕ
 * 9-значні 1С-коди, тож словесні рядки — «мертві», але засмічують фільтр.
 *
 * Скрипт: для кожної назви лишає КАНОНІЧНИЙ (9-значний код) запис, переносить
 * усіх клієнтів з дублів на нього (обидві осі — загальний+оперативний статус),
 * і видаляє дублі. Dry-run за замовчуванням; запис лише з `--apply`.
 *
 * Запуск:
 *   pnpm --filter @ltex/store exec tsx scripts/dedupe-client-statuses.ts
 *   pnpm --filter @ltex/store exec tsx scripts/dedupe-client-statuses.ts --apply
 */

import { prisma } from "@ltex/db";

export interface StatusRow {
  id: string;
  code: string;
  label: string;
}

export interface DedupPlan {
  label: string;
  canonical: StatusRow;
  duplicates: StatusRow[];
}

/** Канонічний код = 9-значний числовий (1С). */
export function isCanonicalCode(code: string): boolean {
  return /^\d{9}$/.test(code);
}

/**
 * Групує статуси за назвою; для груп із >1 записом обирає канонічний
 * (перший 9-значний код, інакше перший за порядком) і решту — у duplicates.
 */
export function planStatusDedup(rows: StatusRow[]): DedupPlan[] {
  const groups = new Map<string, StatusRow[]>();
  for (const r of rows) {
    const key = r.label.trim().toLocaleLowerCase();
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const plans: DedupPlan[] = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    const canonical = arr.find((r) => isCanonicalCode(r.code)) ?? arr[0]!;
    const duplicates = arr.filter((r) => r.id !== canonical.id);
    plans.push({ label: canonical.label, canonical, duplicates });
  }
  return plans;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "[dedupe-statuses] APPLY — записуємо зміни"
      : "[dedupe-statuses] DRY-RUN — лише показуємо план (додайте --apply)",
  );

  const rows = await prisma.mgrClientStatus.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, label: true },
  });
  const plans = planStatusDedup(rows);

  if (plans.length === 0) {
    console.log("[dedupe-statuses] Дублікатів не знайдено. Нічого робити.");
    return;
  }

  let reassignedGeneral = 0;
  let reassignedOperational = 0;
  let removed = 0;

  for (const plan of plans) {
    console.log(
      `\n«${plan.label}» → канонічний код ${plan.canonical.code} (${plan.canonical.id})`,
    );
    for (const dup of plan.duplicates) {
      const [genCount, opCount] = await Promise.all([
        prisma.mgrClient.count({ where: { statusGeneralId: dup.id } }),
        prisma.mgrClient.count({ where: { statusOperationalId: dup.id } }),
      ]);
      console.log(
        `   дубль код ${dup.code} (${dup.id}): клієнтів заг=${genCount}, опер=${opCount} → перенести й видалити`,
      );
      if (apply) {
        const g = await prisma.mgrClient.updateMany({
          where: { statusGeneralId: dup.id },
          data: { statusGeneralId: plan.canonical.id },
        });
        const o = await prisma.mgrClient.updateMany({
          where: { statusOperationalId: dup.id },
          data: { statusOperationalId: plan.canonical.id },
        });
        reassignedGeneral += g.count;
        reassignedOperational += o.count;
        await prisma.mgrClientStatus.delete({ where: { id: dup.id } });
        removed += 1;
      }
    }
  }

  console.log(
    apply
      ? `\n[dedupe-statuses] Готово. Перенесено: заг=${reassignedGeneral}, опер=${reassignedOperational}; видалено дублів=${removed}.`
      : `\n[dedupe-statuses] Це був dry-run. Знайдено груп із дублями: ${plans.length}. Додайте --apply щоб застосувати.`,
  );
}

// Запускаємо лише як CLI (не при імпорті у тестах).
if (process.argv[1] && process.argv[1].includes("dedupe-client-statuses")) {
  main()
    .catch((e) => {
      console.error("[dedupe-statuses] FATAL:", e);
      process.exitCode = 1;
    })
    .finally(() => void prisma.$disconnect());
}
