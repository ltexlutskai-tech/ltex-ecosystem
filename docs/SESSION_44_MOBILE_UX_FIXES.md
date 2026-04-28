# Session 44 — Worker Task: Mobile UX Fixes Batch

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P2 (UX polish; ні один пункт не блокує роботу)
**Очікуваний ефорт:** 1-2 години
**Тип:** worker session
**Передумови:** S43 merged (HomeScreen 4 rails + recommendations), CatalogScreen працює з S38

---

## Контекст

Накопичились 3 малі UX issues у mobile catalog flow:

1. **Backdrop tap discard warning** — у `CatalogFilterSheet.tsx:149` Pressable backdrop одразу закриває sheet через `onClose()`. Якщо user уже понабирав фільтрів і випадково тапнув мимо — все втрачається без попередження.
2. **Subcategory filter відсутній** — на mobile у CatalogFilterSheet тільки top-level категорія. Web (`/catalog/[categorySlug]/[subcategorySlug]`) підтримує subcategory drill-down. Mobile parity вимагає такий же фільтр.
3. **List mode toggle** — web має grid/list toggle (S31 feature). Mobile тільки `numColumns={2}` grid. Додати кнопку перемикання у CatalogScreen header або filter sheet.

---

## Branch

`claude/session-44-mobile-ux-fixes` від main.

---

## Hard rules

1. НЕ міняти `expo`/`react-native`/`@react-navigation` версій.
2. НЕ ламати existing `CatalogFilterSheet` API contract — props/onApply/onClose стабільні.
3. List mode preference — persistent via `expo-secure-store` (як wishlist S39). Key: `mobile.catalogListMode` value `"grid" | "list"`.
4. Subcategory query: API має це підтримувати — перевірити `apps/store/app/api/catalog/route.ts`. Якщо ні — worker додає підтримку через query param `subcategorySlug`.
5. Discard warning через native `Alert.alert` (з 2 кнопками — "Скасувати" і "Так, втратити"), не custom modal.
6. CI: 264 unit baseline + format + typecheck + build green. +3 нові тести (subcategory query API).

---

## Файли

### 1. Backdrop discard warning

**`apps/mobile-client/src/components/CatalogFilterSheet.tsx`**

Track "dirty" state — true якщо user змінив будь-який фільтр з моменту відкриття. На backdrop tap або hardware back button:

```typescript
import { Alert, BackHandler } from "react-native";

const [isDirty, setIsDirty] = useState(false);
const initialFiltersRef = useRef<FilterState | null>(null);

// При open — snapshot initial filters
useEffect(() => {
  if (visible) {
    initialFiltersRef.current = JSON.parse(JSON.stringify(filters)); // deep copy
    setIsDirty(false);
  }
}, [visible]);

// Будь-яка зміна фільтра → setIsDirty(true) (через handleFilterChange wrapper)
const handleFilterChange = (newFilters: FilterState) => {
  setFilters(newFilters);
  if (initialFiltersRef.current && JSON.stringify(newFilters) !== JSON.stringify(initialFiltersRef.current)) {
    setIsDirty(true);
  }
};

const handleCloseAttempt = () => {
  if (!isDirty) {
    onClose();
    return;
  }
  Alert.alert(
    "Скасувати фільтри?",
    "Ваші зміни не будуть застосовані.",
    [
      { text: "Назад", style: "cancel" },
      { text: "Так, скасувати", style: "destructive", onPress: onClose },
    ],
  );
};

// Backdrop:
<Pressable style={styles.backdrop} onPress={handleCloseAttempt} />

// Modal onRequestClose (Android back):
<Modal onRequestClose={handleCloseAttempt} ...>
```

**Apply button** — НЕ показує warning (apply закриває sheet чисто, без втрати даних).

### 2. Subcategory filter

**Backend перевірка** — спочатку прочитати `apps/store/app/api/catalog/route.ts` і `apps/store/app/(public)/catalog/page.tsx`. Скоріше за все вже працює бо web підтримує `/catalog/[categorySlug]/[subcategorySlug]`. Якщо API приймає `subcategorySlug` — використати готове.

Якщо не приймає — додати:

```typescript
// apps/store/app/api/catalog/route.ts
const subcategorySlug = searchParams.get("subcategorySlug");
// у where:
if (subcategorySlug) {
  where.category = { slug: subcategorySlug, parent: { slug: categorySlug } };
}
```

**Mobile filter sheet** (`CatalogFilterSheet.tsx`):

- Після вибору top-level category → fetch `categoriesApi.subcategories(parentSlug)` (новий endpoint або existing).
- Показати другий picker під першим (conditional render: тільки якщо top-level вибрано і має subcategories).
- Reset subcategory при зміні top-level.

API helper:

```typescript
// apps/mobile-client/src/lib/api.ts
export const categoriesApi = {
  async list() { return apiFetch<Category[]>("/categories"); },
  async subcategories(parentSlug: string) {
    return apiFetch<Category[]>(`/categories?parent=${encodeURIComponent(parentSlug)}`);
  },
};
```

(Якщо `categoriesApi.list()` уже існує і повертає всі — фільтрувати клієнтом по `parentSlug`. Перевірити шо є.)

### 3. List mode toggle

**`apps/mobile-client/src/screens/catalog/CatalogScreen.tsx`**

Toggle між grid (numColumns={2}) і list (numColumns={1} + горизонтальний layout у card з більшим thumbnail).

```typescript
const [layoutMode, setLayoutMode] = useState<"grid" | "list">("grid");

// Load on mount
useEffect(() => {
  SecureStore.getItemAsync("mobile.catalogListMode").then((stored) => {
    if (stored === "list" || stored === "grid") setLayoutMode(stored);
  });
}, []);

const toggleLayout = () => {
  const next = layoutMode === "grid" ? "list" : "grid";
  setLayoutMode(next);
  SecureStore.setItemAsync("mobile.catalogListMode", next).catch(() => {});
};

// Header right button (через navigation.setOptions):
<Pressable onPress={toggleLayout}>
  <Ionicons name={layoutMode === "grid" ? "list" : "grid"} size={22} />
</Pressable>

// FlatList:
<FlatList
  numColumns={layoutMode === "grid" ? 2 : 1}
  key={layoutMode} // FlatList потребує key change на numColumns зміну
  renderItem={({ item }) => (
    <ProductCard product={item} layout={layoutMode} />
  )}
/>
```

**`ProductCard.tsx`** — додати prop `layout?: "grid" | "list"` (default `"grid"`). У `list` mode:
- horizontal flex direction
- thumbnail зліва (~120x120)
- texts/prices справа з `flex: 1`
- видно більше деталей (price tier, country, season)

Worker сам вирішує точні розміри з огляду на існуючі styles.

---

## Тести

- `apps/store/app/api/catalog/route.test.ts` (existing або new) — 1-2 cases для subcategory filter (якщо backend змінювали).
- Mobile тести skip-аються (як завжди — mobile-client typecheck відключений у package.json).
- Manual QA: worker не має mobile environment. User QA після merge — окремий step.

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ (≥264, +0-2 тести)
4. `deploy.ps1` ASCII-only ✅

---

## Out-of-scope

- Web catalog UX fixes (S31 grid/list — вже є на web)
- Filter persistence між sessions (тільки layoutMode persistent)
- Search facets (price range slider, brand filter)
- Empty subcategory state (якщо є категорія без subcategories)

---

## Branch + commit + push

Branch: `claude/session-44-mobile-ux-fixes`
Commit: `feat(s44): mobile UX fixes batch — backdrop warning + subcategory filter + list toggle`
Push на feature branch — НЕ мерджити. Orchestrator review-ить і merge.

---

## Deploy notes

Без DB migration. Тільки code → deploy.ps1. Прямий шлях.
