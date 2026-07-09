/**
 * Ролі, що можуть створювати/редагувати/проводити документ «Зміна стану мішка».
 *
 * Окремий крихітний модуль (а не в `bag-state.ts` чи `route.ts`), бо:
 *  • App Router забороняє довільні експорти з route-файлів (лише HTTP-методи);
 *  • тести мокають `@/lib/manager/bag-state` (create/update) — константа мусить
 *    жити поза мокнутим модулем, інакше стає undefined у роут-хендлерах.
 */
export const BAG_STATE_WRITE_ROLES = ["warehouse", "admin", "owner"] as const;
