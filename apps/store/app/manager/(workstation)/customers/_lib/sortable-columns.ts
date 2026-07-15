// Колонки списку клієнтів, за якими підтримується сортування (мають бути у
// buildClientsOrderBy у load-clients.ts). Реляційні колонки (статуси, канал,
// тощо) сортування не підтримують і рендеряться звичайним заголовком.
export const SORTABLE_COLUMN_KEYS = new Set<string>([
  "name",
  "tradePointName",
  "code1C",
  "phonePrimary",
  "region",
  "city",
  "debt",
  "overdueDebt",
  "monthlyVolume",
  "daysSinceLast",
  "lastSyncedAt",
  "createdAt",
  "agent",
]);
