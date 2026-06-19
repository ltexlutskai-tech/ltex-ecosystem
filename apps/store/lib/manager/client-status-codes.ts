/**
 * Спільні дані довідника статусів контрагентів (порт 1С
 * `Справочник.СтатусыКонтрагентов`). Коди/назви з офлайн-дампу
 * `docs/1c-export-2026-06-02/Catalogs/СтатусыКонтрагентов/Ext/Predefined.xml`
 * (MSSQL НЕ потрібен).
 *
 * Чистий модуль БЕЗ side-effects — імпортується і seed-скриптом, і раннером
 * перерахунку статусів (`lib/manager/recompute-client-statuses.ts`).
 */

export interface SeedStatus {
  /** `_Code` з 1С (9-значний) */ code: string;
  /** `Description` з 1С */ label: string;
  /** наша семантика — колір бейджа */ colorHex: string;
  /** порядок відображення */ sortOrder: number;
}

/**
 * 7 предвизначених статусів. Порядок: активні/нові спершу, тоді спадні стани.
 */
export const CLIENT_STATUS_SEED: SeedStatus[] = [
  { code: "000000001", label: "Активний", colorHex: "#16a34a", sortOrder: 10 },
  { code: "000000003", label: "Новий", colorHex: "#2563eb", sortOrder: 20 },
  {
    code: "000000007",
    label: "Потенційний",
    colorHex: "#0891b2",
    sortOrder: 30,
  },
  {
    code: "000000004",
    label: "Малоактивний",
    colorHex: "#ca8a04",
    sortOrder: 40,
  },
  {
    code: "000000002",
    label: "Неактивний",
    colorHex: "#6b7280",
    sortOrder: 50,
  },
  {
    code: "000000006",
    label: "Тимчасово не працює",
    colorHex: "#9333ea",
    sortOrder: 60,
  },
  { code: "000000005", label: "Закрився", colorHex: "#dc2626", sortOrder: 70 },
];
