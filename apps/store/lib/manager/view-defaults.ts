// Per-user view prefs (M1.3e): default configs + key whitelists.
// Канонічний список ключів і дефолтні конфіги для двох views — таблиці клієнтів
// та панелі фільтрів. mergePrefs() склеює user-saved конфіг з actual набором
// ключів — нові auto-append як invisible, unknown — drop.

export interface ConfigItem {
  key: string;
  visible: boolean;
  order: number;
}

export type ViewKey = "clients_table" | "clients_filters";

export const VIEW_KEYS: readonly ViewKey[] = [
  "clients_table",
  "clients_filters",
] as const;

export function isViewKey(value: string): value is ViewKey {
  return (VIEW_KEYS as readonly string[]).includes(value);
}

// ─── clients_table ─────────────────────────────────────────────────────────

export const CLIENTS_TABLE_KEYS = [
  "name",
  "tradePointName",
  "code1C",
  "phonePrimary",
  "statusGeneral",
  "statusOperational",
  "searchChannel",
  "deliveryMethod",
  "categoryTT",
  "priceType",
  "primaryAssortment",
  "primaryRoute",
  "agent",
  "region",
  "city",
  "debt",
  "overdueDebt",
  "monthlyVolume",
  "daysSinceLast",
  "lastSyncedAt",
  "createdAt",
] as const;

export type ClientsTableKey = (typeof CLIENTS_TABLE_KEYS)[number];

export const CLIENTS_TABLE_DEFAULT: ConfigItem[] = [
  { key: "name", visible: true, order: 1 },
  { key: "phonePrimary", visible: true, order: 2 },
  { key: "debt", visible: true, order: 3 },
  { key: "statusGeneral", visible: true, order: 4 },
  { key: "searchChannel", visible: true, order: 5 },
  { key: "daysSinceLast", visible: true, order: 6 },
  { key: "agent", visible: true, order: 7 },
];

// ─── clients_filters ───────────────────────────────────────────────────────

export const CLIENTS_FILTERS_KEYS = [
  "search",
  "statusGeneralId",
  "statusOperationalId",
  "searchChannelId",
  "deliveryMethodId",
  "categoryTTId",
  "priceTypeId",
  "primaryAssortmentId",
  "primaryRouteId",
  "agentUserId",
  "region",
  "city",
  "daysSinceRange",
  "createdRange",
  "hasDebt",
  "hasOverpayment",
  "onlyMine",
  "hideTrash",
] as const;

export type ClientsFiltersKey = (typeof CLIENTS_FILTERS_KEYS)[number];

export const CLIENTS_FILTERS_DEFAULT: ConfigItem[] = [
  { key: "search", visible: true, order: 1 },
  { key: "statusGeneralId", visible: true, order: 2 },
  { key: "searchChannelId", visible: true, order: 3 },
  { key: "deliveryMethodId", visible: true, order: 4 },
  { key: "hasDebt", visible: true, order: 5 },
  { key: "hasOverpayment", visible: true, order: 6 },
  { key: "onlyMine", visible: true, order: 7 },
  { key: "hideTrash", visible: true, order: 8 },
];

// ─── Lookup helpers ────────────────────────────────────────────────────────

export function getAllKeysFor(viewKey: ViewKey): readonly string[] {
  return viewKey === "clients_table"
    ? CLIENTS_TABLE_KEYS
    : CLIENTS_FILTERS_KEYS;
}

export function getDefaultsFor(viewKey: ViewKey): ConfigItem[] {
  return viewKey === "clients_table"
    ? CLIENTS_TABLE_DEFAULT.map((i) => ({ ...i }))
    : CLIENTS_FILTERS_DEFAULT.map((i) => ({ ...i }));
}

// ─── Merge logic ───────────────────────────────────────────────────────────
// 1. Validate: drop saved items where key ∉ allKeys (захист від stale prefs).
// 2. Dedup: при дублікатах keys беремо перше входження.
// 3. Auto-append missing keys (з allKeys але немає у saved) з visible: false.
// 4. Renumber order у фінальному ASC порядку.

export function mergePrefs(
  saved: ConfigItem[] | null | undefined,
  defaults: ConfigItem[],
  allKeys: readonly string[],
): ConfigItem[] {
  const allKeysSet = new Set(allKeys);

  if (!saved || saved.length === 0) {
    // Жодного збереженого — почати з дефолтів і дописати решту keys
    const result = defaults
      .filter((i) => allKeysSet.has(i.key))
      .map((i) => ({ ...i }));
    const used = new Set(result.map((i) => i.key));
    let nextOrder = result.length + 1;
    for (const key of allKeys) {
      if (!used.has(key)) {
        result.push({ key, visible: false, order: nextOrder });
        nextOrder += 1;
      }
    }
    return renumber(result);
  }

  const seen = new Set<string>();
  const filtered: ConfigItem[] = [];
  // Сортуємо saved по order — стабільність UI між saves.
  const sortedSaved = [...saved].sort((a, b) => a.order - b.order);
  for (const item of sortedSaved) {
    if (!allKeysSet.has(item.key)) continue; // unknown key
    if (seen.has(item.key)) continue; // duplicate
    seen.add(item.key);
    filtered.push({
      key: item.key,
      visible: Boolean(item.visible),
      order: filtered.length + 1,
    });
  }

  // Auto-append нові keys (з allKeys але не у saved) як invisible.
  let nextOrder = filtered.length + 1;
  for (const key of allKeys) {
    if (!seen.has(key)) {
      filtered.push({ key, visible: false, order: nextOrder });
      nextOrder += 1;
    }
  }

  return filtered;
}

function renumber(items: ConfigItem[]): ConfigItem[] {
  return items.map((item, idx) => ({ ...item, order: idx + 1 }));
}
