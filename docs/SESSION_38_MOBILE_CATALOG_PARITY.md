# Session 38 — Worker Task: Mobile Catalog Parity with Web

**Створено orchestrator-ом:** 2026-04-27
**Пріоритет:** P1 (UX consistency — каталог на мобілці не схожий на веб)
**Очікуваний ефорт:** 60-90 хвилин
**Тип:** worker session (UI rewrite)

---

## Контекст

Мобільний каталог (`apps/mobile-client/src/screens/catalog/CatalogScreen.tsx` + `apps/mobile-client/src/components/ProductCard.tsx`) має власну React Native стилістику, яка не паритетна з вебом. На вебі (S30/S31) каталог уже має завершений UX:

- Сітка карток 2-3-4 колонки (адаптивна)
- Картка: фото 4:3, NEW/SALE бейджі (top-left), wishlist heart (top-right), назва, quality + season Badge-и, ціна великим зеленим
- Фільтри: bottom-sheet (мобільний) / sidebar (desktop) з пошуком, quality select, season select, country select, sort, price range, in-stock toggle, clear all

Мобілка зараз показує:
- Один товар на ширину екрану (вертикальний лист)
- Тільки quality chip filter горизонтально (при тапі надувається на пів-екрану — UX bug)
- Власна стилістика картки що не співпадає з вебом

Користувач хоче 1-в-1 паритет з вебом — щоб на мобільному додатку і сайті було однакове візуальне сприйняття.

---

## Branch

`claude/session-38-mobile-catalog-parity` від main.

---

## Hard rules

1. **НЕ змінювати** `/api/catalog` server endpoint (apps/store/app/api/catalog/route.ts)
2. **НЕ додавати** нові npm залежності якщо можна обійтись — використати `Modal`, `Pressable`, `FlatList` з react-native core
3. **НЕ ламати** authProvider/auth flow — каталог public, useAuth не потрібен
4. **НЕ чіпати** Home / Search / Cart / More screens — тільки catalog
5. **НЕ ламати** S33 home screen 4-кнопкову навігацію (Каталог → CatalogScreen все ще через `navigation.navigate("Catalog")`)
6. ASCII не вимагається — це RN, UTF-8 OK для україномовного UI
7. TypeScript strict, 0 `any`

---

## Tasks

### Task 1: Переписати ProductCard.tsx під веб-паритет

**Файл:** `apps/mobile-client/src/components/ProductCard.tsx`

**Референс:** `apps/store/components/store/product-card.tsx` (web).

**Що зробити:**

- Aspect ratio 4:3 для фото (використати `aspectRatio: 4/3` через React Native style)
- NEW бейдж (синій `#2563eb`) і SALE бейдж (червоний `#dc2626`) у лівому верхньому куті фото, якщо `isNew` / `hasSale`
- Wishlist heart icon у правому верхньому куті (Ionicons `heart-outline` / `heart`, поки що state-less, тільки UI; реальна логіка — окрема сесія)
- Quality бейдж + Season бейдж під назвою (тонкі, outlined — `borderWidth: 1, borderColor: '#d1d5db', borderRadius: 4, padding 2/6`)
- Велика зелена ціна (`#16a34a`, `fontSize: 18, fontWeight: 'bold'`) з малим `/кг` або `/шт` поряд
- 2-column grid готовий — картка має фіксовану ширину `(screenWidth - padding) / 2`, тому використовувати `flex: 1` всередині FlatList numColumns=2

**Adapter:** `/api/catalog` повертає продукти в shape:

```ts
{
  id: string;
  slug: string;
  name: string;
  quality: string;
  season: string;
  priceUnit: "kg" | "piece";
  country: string;
  videoUrl: string | null;
  images: { url: string; alt: string }[];
  _count: { lots: number };
  prices: { amount: number; currency: string; priceType: string }[];
  createdAt?: string | null;
}
```

Поточний `ProductCardItem` (мобілка) має `imageUrls: string[]` + `minPriceEur: number`. Або зробити transform в CatalogScreen перед передачею в картку, **або** змінити `ProductCardItem` shape під raw response (краще — менше mapping коду). Вибрати другий варіант.

`isNew` обчислити через `Date.now() - new Date(createdAt).getTime() < 14 * 24 * 60 * 60 * 1000`. `hasSale` — через `prices.some(p => p.priceType === 'akciya')`. Wholesale price — `prices.find(p => p.priceType === 'wholesale')`.

### Task 2: Bottom-sheet фільтр на мобільному

**Файл:** новий `apps/mobile-client/src/components/CatalogFilterSheet.tsx`.

**Референс:** `apps/store/components/store/catalog-filters.tsx` (всі поля) + `catalog-sidebar.tsx` (Sheet UX).

**Реалізація:**

- React Native `Modal` з `animationType="slide"` і `transparent={true}`
- Висота modal: 85% екрану, прикріплений до низу (стиль як веб Sheet bottom drawer)
- Header: "Фільтри" + хрестик закрити справа
- Поля (вертикально, скроллабельно):
  - Пошук (TextInput, placeholder "Пошук товарів...")
  - Якість (горизонтальні chip-кнопки — як зараз, але SCROLLABLE FlatList horizontal, зі станом single-select)
  - Сезон (chips: ВЛ зима, літо, демі, all-season)
  - Країна (chips з трибуквенними кодами: GB, DE, CA, PL)
  - Сортування (chips: за замовч., ↓ ціна, ↑ ціна, А-Я, новизна)
  - Ціна (два TextInput з keyboardType="numeric" + label "EUR")
  - Чекбокс "В наявності"
- Кнопка знизу "Застосувати" (зелена) — закриває sheet і викликає callback `onApply(filters)` з усіма поточними значеннями
- Кнопка "Скинути все" (червона outline) над "Застосувати" якщо є хоч один фільтр

**Контракт пропсів:**

```ts
interface CatalogFilters {
  q?: string;
  quality?: string;
  season?: string;
  country?: string;
  sort?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
}

interface CatalogFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  initialFilters: CatalogFilters;
  onApply: (filters: CatalogFilters) => void;
}
```

### Task 3: Переписати CatalogScreen під 2-колонковий grid

**Файл:** `apps/mobile-client/src/screens/catalog/CatalogScreen.tsx`

**Що зробити:**

- Прибрати горизонтальний quality FlatList (перенесено в bottom sheet)
- Header: search bar + кнопка "Фільтри" (Ionicons `options-outline`) поряд. При тапі — відкриває `CatalogFilterSheet`. Якщо є активні фільтри (крім порожніх) — показати маленький бейдж з числом фільтрів
- FlatList з `numColumns={2}`, `columnWrapperStyle={{ gap: 8, paddingHorizontal: 12 }}`, `contentContainerStyle={{ gap: 8, paddingTop: 12 }}`
- Не фантазувати з spacing — картки мають бути близько одна до одної як в Розетці
- Pagination через `onEndReached` залишити як є
- Стани empty/loading/error залишити, лише адаптувати під 2-column grid

**Параметри API:** дати в `catalogApi.products(params)` всі поля з `CatalogFilters` (q, quality, season, country, sort, priceMin, priceMax, inStock).

### Task 4: Розширити catalogApi.products типи

**Файл:** `apps/mobile-client/src/lib/api.ts`

Поточний:

```ts
products: (params: Record<string, string>) =>
  api("/catalog", { params, skipAuth: true }),
```

Залишити так само (params уже типізовані як string), але додати typed return:

```ts
products: (params: Record<string, string>) =>
  api<{
    products: WebCatalogProduct[];
    total: number;
    totalPages: number;
    page: number;
  }>("/catalog", { params, skipAuth: true }),
```

Де `WebCatalogProduct` — той же shape як у веб ProductCard (експортувати з api.ts або з ProductCard.tsx).

### Task 5: Verify

- `pnpm format:check` — pass
- `pnpm -r typecheck` — мобілка excluded з workspace, тому це не зачіпає її. Але опціонально — `cd apps/mobile-client && npx tsc --noEmit` (потребує node_modules встановлених — на Linux side worker має mock).
  Якщо tsc не може запуститись — пропустити, лишити `// @ts-expect-error` мінімально.
- `pnpm -r test` — pass (243 baseline)
- Не запускати додаток — orchestrator запустить на телефоні і перевірить вручну.

---

## Out of scope (НЕ робити)

- Wishlist реальна логіка (heart toggle persistence) — окрема сесія
- QuickViewButton (eye icon overlay) — окрема сесія
- List mode toggle (S31 web feature) — на мобілці залишається тільки grid
- Subcategory filter — поки немає, додамо коли потрібно
- Animation для bottom sheet (gesture drag-to-close) — `Modal animationType="slide"` достатньо для v1
- Деpендcии на `@gorhom/bottom-sheet` чи інші — обходимось `Modal`

---

## Commit strategy

Кожен Task — окремий коміт:

```
feat(mobile): rewrite ProductCard for web parity (Task 1/4)
feat(mobile): add CatalogFilterSheet bottom modal (Task 2/4)
feat(mobile): switch CatalogScreen to 2-column grid + filter sheet (Task 3/4)
chore(mobile): typed catalogApi.products return (Task 4/4)
```

Або один великий якщо легше — як зручніше. Головне — push на feature branch.

---

## Push

```bash
git push -u origin claude/session-38-mobile-catalog-parity
```

Звіт мені:

- branch (із суфіксом)
- Перелік commit-ів
- Чи всі 4 Tasks завершено
- Будь-які знахідки / питання які треба обговорити перед merge
