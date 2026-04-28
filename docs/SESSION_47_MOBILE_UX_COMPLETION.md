# Session 47 — Worker Task: Mobile UX Completion (Wishlist Merge + QuickView Carousel)

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P2 (mobile UX completion — два loose ends з S39 і S45)
**Очікуваний ефорт:** 1-2 години
**Тип:** worker session
**Передумови:** S39 wishlist persistence merged, S45 QuickView modal merged

---

## Контекст

Два mobile UX дрібних loose end:

1. **Pull-on-login wishlist merge** (S39 follow-up). Зараз `WishlistProvider` тримає wishlist у SecureStore (ключ `ltex_wishlist_v1`, до 100 items). Коли user логиниться, ми пишемо новий item у server (`/api/mobile/favorites`) — fire-and-forget. Але якщо user користувався іншим device або раніше у webі — server має items, які локалі немає. Треба on login підтягнути server wishlist і merge з локальним (union by `productId`, dedup, обрізати до 100).

2. **Image carousel у QuickView** (S45 follow-up). Зараз `QuickViewModal` показує тільки `product.images[0]`. Якщо у продукта декілька зображень (`product.images.length > 1`) — треба горизонтальний swipeable carousel з dots indicator.

---

## Branch

`claude/session-47-mobile-ux-completion` від main.

---

## Hard rules

1. НЕ міняти `expo`/`react-native`/`@react-navigation` версій.
2. Wishlist merge — **union, не replace**. Локальні items зберігаються (включно з тими, що ще не пуш-нулись на server). Conflict resolution: server data win над local на той самий productId (server має повніший shape).
3. Merge зрівнює до `MAX_ITEMS=100` (cap S39). Якщо union > 100 — обрізати по `viewedAt`/recent-first.
4. Carousel — pure RN `FlatList horizontal pagingEnabled` (без додаткових deps на типу `react-native-snap-carousel`).
5. Dots indicator — простий View з 8x8 dots під carousel-ом.
6. CI: 271 unit baseline + format + typecheck + build green. Тести можна skip (mobile only).

---

## Файли

### 1. Pull-on-login wishlist merge

**`apps/mobile-client/src/lib/wishlist-provider.tsx`** — додати effect що тригериться на `customerId` change:

```typescript
import { favoritesApi } from "./api";

// у WishlistProvider:
const { customerId } = useAuth();
const [items, setItems] = useState<WebCatalogProduct[]>([]);

// Existing effect: load from SecureStore on mount (вже є)

// NEW: коли customerId стає truthy (login event), pull server wishlist + merge.
const lastSyncedCustomerIdRef = useRef<string | null>(null);
useEffect(() => {
  if (!customerId) {
    lastSyncedCustomerIdRef.current = null;
    return;
  }
  if (lastSyncedCustomerIdRef.current === customerId) return; // вже синкнули

  (async () => {
    try {
      const serverItems = await favoritesApi.list(); // returns { favorites: [{ id, productId, product: {...} }] }
      // Перетворити server shape у WebCatalogProduct shape
      const serverProducts: WebCatalogProduct[] = serverItems.favorites.map(
        (f) => ({
          id: f.product.id,
          slug: f.product.slug,
          name: f.product.name,
          quality: f.product.quality,
          season: f.product.season ?? "",
          priceUnit: f.product.priceUnit,
          country: f.product.country ?? "",
          videoUrl: f.product.videoUrl,
          createdAt: f.product.createdAt,
          images: f.product.images.map((img) => ({
            url: img.url,
            alt: img.alt ?? "",
          })),
          prices: f.product.prices.map((p) => ({
            amount: Number(p.amount),
            currency: p.currency,
            priceType: p.priceType,
          })),
          _count: { lots: f.product._count.lots },
        }),
      );

      // Union: server win on conflict (productId)
      const localIds = new Set(items.map((i) => i.id));
      const merged = [
        ...serverProducts, // server first (newer/canonical shape)
        ...items.filter((i) => !serverProducts.some((s) => s.id === i.id)),
      ].slice(0, MAX_ITEMS);

      setItems(merged);
      saveToStorage(merged); // persist merged result
      lastSyncedCustomerIdRef.current = customerId;
    } catch {
      // Network/parse error — silent. Local wishlist unchanged.
    }
  })();
}, [customerId]); // не depend on `items` — це викличе loop
```

**`apps/mobile-client/src/lib/api.ts`** — переконатись що `favoritesApi.list()` повертає правильний shape. Може треба додати:

```typescript
export const favoritesApi = {
  async list() {
    return apiFetch<{ favorites: ServerFavorite[] }>("/favorites");
  },
  ...
};

interface ServerFavorite {
  id: string;
  productId: string;
  product: {
    id: string;
    slug: string;
    name: string;
    quality: string;
    season: string | null;
    priceUnit: string;
    country: string | null;
    videoUrl: string | null;
    createdAt: string;
    images: { url: string; alt: string | null }[];
    prices: { amount: number; currency: string; priceType: string }[];
    _count: { lots: number };
  };
}
```

(Якщо `favoritesApi.list()` уже існує — перевірити shape, при потребі adjust).

### 2. Image carousel у QuickView

**`apps/mobile-client/src/components/QuickViewModal.tsx`** — замінити Single `<Image>` на `<FlatList horizontal pagingEnabled>`:

```typescript
import { useRef, useState } from "react";
import { FlatList, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const [activeIndex, setActiveIndex] = useState(0);
const scrollRef = useRef<FlatList>(null);

const onScroll = (e) => {
  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
  if (idx !== activeIndex) setActiveIndex(idx);
};

// замість <View style={styles.imageBox}>...<Image>... </View>:
<View style={styles.imageBox}>
  <FlatList
    ref={scrollRef}
    data={product.images}
    horizontal
    pagingEnabled
    showsHorizontalScrollIndicator={false}
    onMomentumScrollEnd={onScroll}
    keyExtractor={(item, i) => `${item.url}-${i}`}
    renderItem={({ item }) => (
      <Image source={{ uri: item.url }} style={[styles.image, { width: SCREEN_WIDTH }]} resizeMode="cover" />
    )}
  />

  {/* SALE badge + Heart лишаються, але position:absolute zIndex 1 */}
  {akciyaPrice && <View style={styles.saleBadge}><Text style={styles.saleBadgeText}>SALE</Text></View>}
  <TouchableOpacity style={styles.heartBtn} onPress={() => toggle(product)}>
    <Ionicons name={inList ? "heart" : "heart-outline"} size={28} color={inList ? "#dc2626" : "#fff"} />
  </TouchableOpacity>

  {/* Dots indicator — тільки якщо більше 1 image */}
  {product.images.length > 1 && (
    <View style={styles.dotsContainer}>
      {product.images.map((_, i) => (
        <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
      ))}
    </View>
  )}
</View>
```

Стилі додати:

```typescript
dotsContainer: {
  position: "absolute",
  bottom: 8,
  left: 0, right: 0,
  flexDirection: "row",
  justifyContent: "center",
  gap: 6,
},
dot: {
  width: 8, height: 8, borderRadius: 4,
  backgroundColor: "rgba(255,255,255,0.5)",
},
dotActive: {
  backgroundColor: "#fff",
},
```

**Edge case:** якщо `product.images.length === 0` — show empty placeholder (як зараз). Не падати.

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ 271/271
4. ASCII-only deploy.ps1 ✅

---

## Out-of-scope

- Add to cart з QuickView (потребує lot selection, не fit-ить modal)
- Pinch-to-zoom на images (стандартний swipe достатньо)
- Pull-on-logout — clear local wishlist (НЕ робимо, користувач може користуватись guest mode)
- Conflict resolution UI (alert "переглянути різницю") — перевизначити просто union with server-win
- Web wishlist sync (web ще не має authenticated wishlist)

---

## Branch + commit + push

Branch: `claude/session-47-mobile-ux-completion`
Commit: `feat(s47): mobile UX completion — wishlist login merge + QuickView image carousel`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Прямий deploy.ps1.
