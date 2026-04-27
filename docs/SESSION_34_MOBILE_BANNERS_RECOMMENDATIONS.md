# Session 34 — Worker Task: Mobile Home Banners + Recommendations

**Створено orchestrator-ом:** 2026-04-27
**Пріоритет:** P1 (mobile parity — HomeScreen наразі placeholder після S33 restructure)
**Очікуваний ефорт:** 4-5 годин
**Тип:** worker session

---

## Контекст

S33 переробив mobile home у Rozetka-style з 4-tab nav (Home / Search / Cart / More). Зараз `apps/mobile-client/src/screens/home/HomeScreen.tsx` показує:

- Hardcoded banner `<View>` з текстом "L-TEX / Секонд хенд, сток, іграшки гуртом від 10 кг"
- Search input
- 4 quick action кнопки (Catalog / Lots / Notifications / Wishlist)
- Section "Рекомендації для вас" з placeholder `<Ionicons name="sparkles-outline">` + текст "Перегляньте товари у каталозі — ми покажемо схожі тут"

Web home (`apps/store/app/(store)/page.tsx`) має 9 секцій — banners → featured → sale → new → categories → video → recently viewed → features → CTA. Mobile має тягнутись до базового парітету: реальні банери з адмінки + featured/sale/new + recently viewed.

S34 приводить mobile home до робочого стану з реальним контентом.

---

## Branch

`claude/session-34-mobile-banners-recommendations` від main.

---

## Hard rules

1. **НЕ** змінювати Expo SDK або React Native версії. Все — pure JS / TypeScript.
2. **НЕ** додавати нові native deps (AsyncStorage, etc.) — використовуй `expo-secure-store` за патерном `auth-provider.tsx` / `wishlist-provider.tsx`.
3. **НЕ** робити push до Supabase Storage / S3 з worker — банери вже завантажує admin через `/admin/banners`. Worker тільки читає.
4. **НЕ** редагувати existing web routes у `apps/store/app/api/` (admin/cart/catalog/...) — створюй нові під `apps/store/app/api/mobile/home/`.
5. CI має лишитися green: 243 unit + format + typecheck + build. Mobile-client typecheck — no-op за тулчейном (як було).
6. ASCII-only у `.ps1` файлах (тут не міняємо, але правило проєкту).

---

## Tasks

### Task 1: New mobile home API route

**Файл:** `apps/store/app/api/mobile/home/route.ts` (новий)

Single endpoint що повертає все потрібне для HomeScreen за один request, щоб мобілка не робила 4 окремих round-trip-и через слабкі мережі.

```ts
import { NextResponse } from "next/server";
import { prisma } from "@ltex/db";

export async function GET() {
  const [banners, featured, onSale, newArrivals] = await Promise.all([
    prisma.banner.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        title: true,
        subtitle: true,
        imageUrl: true,
        ctaLabel: true,
        ctaHref: true,
      },
    }),
    prisma.featuredProduct.findMany({
      orderBy: { position: "asc" },
      take: 12,
      include: {
        product: {
          include: {
            images: { take: 1, orderBy: { position: "asc" } },
            prices: {
              where: { priceType: { in: ["wholesale", "akciya"] } },
              take: 5,
            },
            _count: { select: { lots: true } },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: {
        inStock: true,
        prices: { some: { priceType: "akciya" } },
      },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: {
        images: { take: 1, orderBy: { position: "asc" } },
        prices: {
          where: { priceType: { in: ["wholesale", "akciya"] } },
          take: 5,
        },
        _count: { select: { lots: true } },
      },
    }),
    prisma.product.findMany({
      where: { inStock: true },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: {
        images: { take: 1, orderBy: { position: "asc" } },
        prices: {
          where: { priceType: { in: ["wholesale", "akciya"] } },
          take: 5,
        },
        _count: { select: { lots: true } },
      },
    }),
  ]);

  return NextResponse.json({
    banners,
    featured: featured
      .filter((e) => e.product)
      .map((e) => mapProduct(e.product)),
    onSale: onSale.map(mapProduct),
    newArrivals: newArrivals.map(mapProduct),
  });
}
```

`mapProduct` — приватний helper, перетворює Prisma product у `WebCatalogProduct` shape (як `apps/mobile-client/src/lib/api.ts`). Мапіть тільки потрібні поля. **Можна перевикористати** існуючий mapper якщо знайдете у `lib/catalog.ts` — інакше дублюй локально (3-4 рядки).

**Auth:** не потрібен — це публічні дані. БЕЗ `requireMobileSession`. Без rate limit (read-only, public).

**ISR/cache:** додай `export const revalidate = 60;` щоб Next кешував 60с.

### Task 2: typed API client method

**Файл:** `apps/mobile-client/src/lib/api.ts`

Додай у нижній частині:

```ts
export interface MobileHomeBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
}

export interface MobileHomeData {
  banners: MobileHomeBanner[];
  featured: WebCatalogProduct[];
  onSale: WebCatalogProduct[];
  newArrivals: WebCatalogProduct[];
}

export const homeApi = {
  get: () => api<MobileHomeData>("/mobile/home", { skipAuth: true }),
};
```

### Task 3: BannerCarousel mobile component

**Файл:** `apps/mobile-client/src/components/BannerCarousel.tsx` (новий)

React Native carousel — використай `FlatList` з `horizontal`, `pagingEnabled`, `snapToInterval`. **НЕ додавай** `react-native-reanimated-carousel` чи інші deps.

Specs:

- Висота: 180-200dp (mobile-friendly, не як web 256-384px)
- Auto-rotate: 6с інтервал, скидається на manual swipe
- Dots indicator знизу (звичайні `<View>` з активним bg)
- Tap по banner → `Linking.openURL(ctaHref)` якщо це external URL, інакше parse як deep link (`ltex://catalog`, `ltex://product/X` тощо)
- Якщо `banners.length === 0` → return null (нічого не рендерити)
- Image: `<Image>` з `resizeMode="cover"`. CTA + title overlay поверх gradient (можна через `LinearGradient` з `expo-linear-gradient` ЯКЩО воно вже є в deps; інакше — semi-transparent overlay `<View style={backgroundColor: 'rgba(0,0,0,0.4)'}>`).

**Перевір deps перед написанням:** `cat apps/mobile-client/package.json | grep linear-gradient`. Якщо відсутній — fallback на rgba overlay.

### Task 4: HorizontalProductRail компонент

**Файл:** `apps/mobile-client/src/components/HorizontalProductRail.tsx` (новий)

Компонент що показує заголовок секції + horizontal scroll з ProductCard-ами. Reuse у HomeScreen 3 рази (Featured / Sale / New).

Props:

```ts
interface HorizontalProductRailProps {
  title: string;
  products: WebCatalogProduct[];
  onProductPress: (product: WebCatalogProduct) => void;
  onSeeAll?: () => void;
  emptyHint?: string;
}
```

- `<FlatList horizontal showsHorizontalScrollIndicator={false}>` з контентом
- Card width: 160dp, gap 12dp
- Якщо `onSeeAll` — поряд з title рендериться "Усі →" CTA
- Якщо `products.length === 0` і є `emptyHint` — показати маленький placeholder (або просто не рендерити секцію)
- Wishlist heart має працювати — інтегруй `useWishlist()` тут і передай `isWishlisted`/`onWishlistToggle` у `<ProductCard>`

**Reuse:** `<ProductCard>` уже існує у `src/components/ProductCard.tsx` — НЕ міняй його, лише імпортуй.

### Task 5: HomeScreen rewrite

**Файл:** `apps/mobile-client/src/screens/home/HomeScreen.tsx`

Заміни:

- Hardcoded banner `<View>` → `<BannerCarousel banners={data.banners} />` (показується ТІЛЬКИ якщо є активні банери)
- Якщо банерів немає — лишається hardcoded fallback "L-TEX / Секонд хенд..." `<View>` (не видаляти, тільки conditional render)
- Видали section "Рекомендації для вас" з placeholder
- Додай натомість 3 секції `<HorizontalProductRail>`:
  - "Топ товарів" (data.featured)
  - "Акції" (data.onSale)
  - "Новинки" (data.newArrivals)
- "Усі →" з кожної рейки навігує в `Catalog` з відповідним фільтром (featured = без фільтра, sale = `?priceType=akciya`, new = `?sort=newest`). Naviгація `navigation.navigate('Catalog', { initialFilters: {...} })` — потребує оновити `CatalogScreen` щоб приймав initialFilters з navigation params (опційно — можна skip і просто навігувати на чистий Catalog у v1).

Data fetch:

```ts
const [data, setData] = useState<MobileHomeData | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  homeApi
    .get()
    .then(setData)
    .catch(() => setError("Не вдалося завантажити головну"))
    .finally(() => setLoading(false));
}, []);
```

Loading state: `<CatalogSkeleton />` чи свій simple skeleton — на твій вибір (CatalogSkeleton вже є у `src/components/SkeletonLoader.tsx`).

Pull-to-refresh: `<ScrollView refreshControl={<RefreshControl ... />}>` — re-fetch при свайпі.

### Task 6: Tests for new API route

**Файл:** `apps/store/app/api/mobile/home/route.test.ts` (новий)

Vitest unit test (mock prisma, перевір shape response):

- 1 тест: повертає 200 з очікуваними ключами `{ banners, featured, onSale, newArrivals }`
- 1 тест: пусті колекції → пусті масиви, не падає
- 1 тест: `mapProduct` правильно мапить prices (тільки wholesale + akciya)

Дивись паттерн у `apps/store/app/api/newsletter/route.test.ts` — як moсkати prisma.

### Task 7: Verification

- [ ] `pnpm format:check`
- [ ] `pnpm -r typecheck` (всі 6 packages green)
- [ ] `pnpm -r test` (244+ tests — додано 3 нові)
- [ ] git diff: тільки 6 нових/змінених файлів за tasks 1-6
- [ ] `LANG=C grep -P '[^\x00-\x7f]'` — нічого незаконного у `.ps1` (не чіпаємо їх взагалі)

---

## Out of scope (НЕ робити)

- Categories carousel на mobile home (S25 додав на web — окрема задача)
- Video reviews section (web секція 6) — окрема задача
- Recently viewed на mobile (потребує SecureStore-based hook + product view tracking у ProductScreen) — окрема задача
- "Frequently bought together" — окрема задача (post-checkout або у product detail)
- Mobile push notifications для нових банерів — окрема задача (post-S36)
- Newsletter signup form у mobile footer — НЕ потрібно (mobile users — це wholesale buyers, не email subscribers)

---

## Commit strategy

Один-два коміти:

1. `feat(mobile-api): /api/mobile/home single-shot endpoint with banners + featured + sale + new`
2. `feat(mobile): HomeScreen rewrite with real banners + 3 product rails`

АБО все в один:

```
feat(mobile): home screen banners + product rails (S34)

Replace HomeScreen placeholder ("ми покажемо схожі тут") with real
admin-managed banners and three horizontal product rails (Featured /
Sale / New) sourced from a new /api/mobile/home endpoint that joins
all four datasets in a single round-trip with 60s ISR.

- New BannerCarousel + HorizontalProductRail components (pure RN,
  no new native deps).
- HorizontalProductRail integrates useWishlist so heart toggling
  in rails mirrors Catalog behaviour.
- HomeScreen falls back to the hardcoded brand banner if there are
  no active banners in DB.
- Pull-to-refresh re-fetches the whole home payload.
```

---

## Push

```bash
git push -u origin claude/session-34-mobile-banners-recommendations
```

Звіт orchestrator-у:

- Кількість коммітів і їх hash-і
- Чи `linear-gradient` вже в deps (так/ні, як вирішив для banner overlay)
- Test count перед/після
- Чи довелось чіпати `CatalogScreen` для прийому `initialFilters` (да/нi, якщо так — детально)
