# Session 53 — Worker Task: Mobile HomeScreen Content Expansion

**Створено orchestrator-ом:** 2026-04-29
**Пріоритет:** P2 (mobile parity з web — поглиблення контенту homepage)
**Очікуваний ефорт:** 3-4 години
**Тип:** worker session
**Передумови:** S43 merged (recommendations), S44 merged (categoriesApi), S52 merged (FAB)

---

## Контекст

Mobile HomeScreen (`apps/mobile-client/src/screens/home/HomeScreen.tsx`) зараз має:

1. Banner carousel
2. "Топ" rail
3. "Акції" rail
4. "Рекомендоване для вас" rail
5. "Новинки" rail

Web homepage має ще:

- VideoReviewsCarousel — продукти з YouTube відео-оглядами
- CategoriesCarousel — топ категорії з фото
- RecentlyViewedSection — продукти що user недавно переглядав
- TestimonialsSlider — відгуки клієнтів

S53 додає mobile-аналоги після "Новинки" rail у тому ж порядку.

---

## Branch

`claude/session-53-mobile-home-sections` від main.

---

## Hard rules

1. НЕ міняти `expo`/`react-native`/`@react-navigation` версій.
2. Стилістика — як у існуючих rail-ів (S34 `HorizontalProductRail`). Не вигадувати нові.
3. Recently-viewed — `expo-secure-store` (не localStorage — RN не має). Ключ `mobile.recently_viewed_v1`. Cap 12 items. Записувати на mount `ProductScreen`.
4. Testimonials — статичні mock-дані (4-5 відгуків), як на web `TestimonialsSlider`. Дані можна винести у `apps/mobile-client/src/lib/testimonials.ts` (locally hardcoded).
5. Video reviews — використовує існуючий endpoint? Перевірити. Якщо немає — додати у `/api/mobile/home` поле `videoProducts` (продукти з `videoUrl IS NOT NULL`, take 8).
6. Categories — `categoriesApi.list()` (S44). Top-level categories with product count.
7. CI: 294 unit baseline + format + typecheck + build green. +1-2 нові тести (якщо backend extension).

---

## Файли

### 1. Backend — extend `/api/mobile/home`

**`apps/store/app/api/mobile/home/route.ts`** — додати `videoProducts` + `categories` у response:

```typescript
const [
  banners,
  featuredEntries,
  onSaleProducts,
  newProducts,
  videoProducts,
  categories,
] = await Promise.all([
  // existing 4 queries...

  // NEW:
  prisma.product.findMany({
    where: { inStock: true, videoUrl: { not: null } },
    take: 8,
    orderBy: { createdAt: "desc" },
    include: mobileProductInclude,
  }),

  prisma.category.findMany({
    where: { parentId: null },
    orderBy: { position: "asc" },
    include: {
      _count: { select: { products: { where: { inStock: true } } } },
    },
  }),
]);

return NextResponse.json({
  banners,
  featured: ...,
  onSale: ...,
  newArrivals: ...,
  videoReviews: videoProducts.map(mapMobileProduct),
  categories: categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    productCount: c._count.products,
  })),
});
```

Update `/api/mobile/home/route.test.ts` — adjust для нових полів.

### 2. Mobile — categories carousel

**`apps/mobile-client/src/components/CategoriesCarousel.tsx`** (new)

```typescript
interface Category {
  id: string;
  slug: string;
  name: string;
  productCount: number;
}

interface Props {
  categories: Category[];
  onPress: (slug: string) => void;
}

export function CategoriesCarousel({ categories, onPress }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Категорії</Text>
      <FlatList
        horizontal
        data={categories}
        keyExtractor={(c) => c.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable onPress={() => onPress(item.slug)} style={styles.card}>
            <View style={styles.iconBox}>
              <Ionicons name="grid-outline" size={32} color="#16a34a" />
            </View>
            <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.count}>{item.productCount} товарів</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: "700", paddingHorizontal: 16, marginBottom: 8 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    width: 120,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    alignItems: "center",
  },
  iconBox: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#ecfdf5",
    justifyContent: "center", alignItems: "center",
    marginBottom: 8,
  },
  name: { fontSize: 13, fontWeight: "600", textAlign: "center", color: "#111827" },
  count: { fontSize: 11, color: "#6b7280", marginTop: 4 },
});
```

Tap on category → navigate до catalog screen з фільтром по category.

### 3. Recently viewed (mobile)

**`apps/mobile-client/src/lib/recently-viewed.ts`** (new) — analog web `useRecentlyViewed`, але через SecureStore:

```typescript
import { useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import type { WebCatalogProduct } from "./api";

const STORAGE_KEY = "mobile.recently_viewed_v1";
const MAX_ITEMS = 12;

interface StoredItem {
  product: WebCatalogProduct;
  viewedAt: number;
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<StoredItem[]>([]);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as StoredItem[];
        setItems(parsed);
      } catch {}
    });
  }, []);

  const addItem = useCallback((product: WebCatalogProduct) => {
    setItems((prev) => {
      const filtered = prev.filter((i) => i.product.id !== product.id);
      const updated = [{ product, viewedAt: Date.now() }, ...filtered].slice(
        0,
        MAX_ITEMS,
      );
      SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(updated)).catch(
        () => {},
      );
      return updated;
    });
  }, []);

  return { items, addItem };
}
```

**`ProductScreen.tsx`** — на mount викликати `addItem(product)` (так само як `productsApi.trackView` з S43, але локально для recent-viewed feed).

### 4. Recently viewed rail на HomeScreen

`HorizontalProductRail` (existing) можна reuse — передати `recentlyViewed.items.map(i => i.product)`.

```typescript
{recentlyViewed.length > 0 && (
  <HorizontalProductRail
    title="Нещодавно переглянуті"
    products={recentlyViewed.items.map(i => i.product)}
    onProductPress={...}
  />
)}
```

### 5. Video reviews rail

`HorizontalProductRail` reuse. Якщо у продукту є `videoUrl` — у `ProductCard` overlay icon `play-circle` поверх hero image. Або просто звичайна картка — tap → ProductScreen, де уже є video player.

```typescript
{home.videoReviews.length > 0 && (
  <HorizontalProductRail
    title="Відеоогляди тижня"
    products={home.videoReviews}
    onProductPress={...}
  />
)}
```

### 6. Testimonials slider

**`apps/mobile-client/src/lib/testimonials.ts`** (new) — статичні дані:

```typescript
export interface Testimonial {
  id: string;
  name: string;
  city: string;
  text: string;
  rating: number;
}

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "1",
    name: "Олена",
    city: "Київ",
    text: "Замовляю вже 3 роки, якість стабільна, відправлення швидке.",
    rating: 5,
  },
  // ... 4-5 елементів. Worker бере з web `TestimonialsSlider` якщо є реальні дані.
];
```

**`TestimonialsCarousel.tsx`** (new) — горизонтальний FlatList з картками `{ rating stars, text, "— Name, City" }`.

```typescript
export function TestimonialsCarousel() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Відгуки клієнтів</Text>
      <FlatList
        horizontal
        pagingEnabled
        data={TESTIMONIALS}
        keyExtractor={(t) => t.id}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.stars}>
              {[...Array(item.rating)].map((_, i) => (
                <Ionicons key={i} name="star" size={16} color="#fbbf24" />
              ))}
            </View>
            <Text style={styles.text}>"{item.text}"</Text>
            <Text style={styles.author}>— {item.name}, {item.city}</Text>
          </View>
        )}
      />
    </View>
  );
}
```

### 7. HomeScreen — wire all sections

**`apps/mobile-client/src/screens/home/HomeScreen.tsx`** — порядок секцій після оновлення:

1. BannerCarousel (existing)
2. "Топ" rail (featured)
3. "Акції" rail (onSale)
4. "Рекомендоване для вас" rail (recommendations)
5. "Новинки" rail (newArrivals)
6. **NEW** "Відеоогляди тижня" — HorizontalProductRail з `home.videoReviews`
7. **NEW** "Категорії" — CategoriesCarousel з `home.categories`
8. **NEW** "Нещодавно переглянуті" — HorizontalProductRail з `useRecentlyViewed`
9. **NEW** "Відгуки клієнтів" — TestimonialsCarousel

`api.ts` extend `MobileHomeData` interface з `videoReviews: WebCatalogProduct[]` + `categories: Category[]`.

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ ≥296 (294 baseline + 1-2 backend tests for home route)
4. `deploy.ps1` ASCII-only ✅

Manual QA після merge:

- HomeScreen scroll показує всі 9 секцій у правильному порядку
- Tap на категорію → catalog filtered by категорія
- Tap на продукт у будь-якому rail → ProductScreen + recent-viewed запис
- Recently viewed рейл з'являється тільки після першого product view
- Testimonials — 4-5 карток swipeable

---

## Out-of-scope

- Real testimonials з DB (`Testimonial` model) — окрема задача, поки mock
- Video player inline у feed (тільки thumbnail, video на ProductScreen)
- Personalized testimonials based on customer order history
- Server-side `RecentlyViewed` для logged-in (зараз тільки SecureStore локально; pull-on-login можна як S39 для wishlist — окрема задача)

---

## Branch + commit + push

Branch: `claude/session-53-mobile-home-sections`
Commit: `feat(s53): mobile home — add video reviews, categories, recently viewed, testimonials`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

- DB не змінюється
- Backend changes: `/api/mobile/home` віддає 2 нових поля (videoReviews + categories) → треба deploy.ps1 server-side
- Mobile-only зміни (нові компоненти + HomeScreen wiring) — Expo app не deployед (PWA), просто load latest код через Expo Go
