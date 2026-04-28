# Session 45 — Worker Task: Mobile QuickView Modal

**Створено orchestrator-ом:** 2026-04-28
**Пріоритет:** P3 (UX nice-to-have, web S31 має це; mobile parity)
**Очікуваний ефорт:** 2-3 години
**Тип:** worker session
**Передумови:** S44 merged (CatalogScreen + ProductCard з list/grid layout)

---

## Контекст

На web є QuickView (S31) — overlay eye icon на ProductCard hover, відкриває modal з основною інфою без переходу на product detail page. Дозволяє переглядати декілька продуктів швидко (важливо для wholesale users порівняння кількох позицій).

Mobile зараз: tap на ProductCard → одразу `navigation.navigate("Product", { id })` → full ProductScreen. Немає швидкого preview.

S45 додає **long-press на ProductCard** → bottom-sheet style modal з:

- Великий thumbnail (carousel якщо кілька зображень)
- Назва продукту
- Якість + сезон + країна
- Ціни (всі tiers)
- "Дивитись повністю" → переходить на full ProductScreen
- "Додати в обране" / "Видалити з обраного" — heart toggle (інтегрується з `useWishlist` hook S39)
- Закривається tap на backdrop або swipe-down

Тривалість long-press — 500ms (стандарт RN). Звичайний tap → стара поведінка (navigation.navigate).

---

## Branch

`claude/session-45-mobile-quickview` від main.

---

## Hard rules

1. НЕ міняти `expo`/`react-native`/`@react-navigation` версій.
2. НЕ ламати ProductCard API: `onPress` має продовжувати працювати; додаємо опціональний `onLongPress` callback.
3. QuickView — окремий компонент `apps/mobile-client/src/components/QuickViewModal.tsx`. Не плутати з ProductScreen — це швидкий preview, не full detail.
4. Trackview (`productsApi.trackView`) на open QuickView НЕ робимо — це не "product_detail" view (зарано). Тільки на full ProductScreen mount (existing behavior з S43).
5. Heart toggle — використовує `useWishlist().toggle(product)` (S39). Не дублювати state.
6. Modal має `presentationStyle="overFullScreen"` + `transparent={true}` — для bottom-sheet ефекту з backdrop.
7. Закриття (close icon, backdrop, swipe-down) — без discard warning (немає state до втрати).
8. CI: 271 unit baseline + format + typecheck + build green. Тести можна skip (mobile only); або 1-2 unit тестів якщо вийде.

---

## Файли

### 1. New `QuickViewModal.tsx` (`apps/mobile-client/src/components/QuickViewModal.tsx`)

```typescript
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { WebCatalogProduct } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";

interface Props {
  product: WebCatalogProduct | null; // null = closed
  onClose: () => void;
  onViewFull: (product: WebCatalogProduct) => void; // navigates to ProductScreen
}

export function QuickViewModal({ product, onClose, onViewFull }: Props) {
  const { isInWishlist, toggle } = useWishlist();

  if (!product) return null;

  const inList = isInWishlist(product.id);
  const wholesalePrice = product.prices.find(p => p.priceType === "wholesale");
  const akciyaPrice = product.prices.find(p => p.priceType === "akciya");

  return (
    <Modal
      visible={product != null}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />

        {/* Image */}
        <View style={styles.imageBox}>
          {product.images[0] && (
            <Image source={{ uri: product.images[0].url }} style={styles.image} resizeMode="cover" />
          )}
          {/* SALE badge if akciya price */}
          {akciyaPrice && <View style={styles.saleBadge}><Text style={styles.saleBadgeText}>SALE</Text></View>}

          {/* Heart toggle */}
          <TouchableOpacity style={styles.heartBtn} onPress={() => toggle(product)}>
            <Ionicons name={inList ? "heart" : "heart-outline"} size={28} color={inList ? "#dc2626" : "#fff"} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 16 }}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.meta}>{[product.quality, product.season, product.country].filter(Boolean).join(" · ")}</Text>

          {/* Prices */}
          <View style={styles.prices}>
            {akciyaPrice && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Акційна:</Text>
                <Text style={styles.priceValueSale}>€{akciyaPrice.amount.toFixed(2)}/{product.priceUnit}</Text>
              </View>
            )}
            {wholesalePrice && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Опт:</Text>
                <Text style={styles.priceValue}>€{wholesalePrice.amount.toFixed(2)}/{product.priceUnit}</Text>
              </View>
            )}
          </View>

          {/* Lots count */}
          {product._count.lots > 0 && (
            <Text style={styles.lotsText}>Лотів у наявності: {product._count.lots}</Text>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Закрити</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.viewBtn}
            onPress={() => {
              onClose();
              onViewFull(product);
            }}
          >
            <Text style={styles.viewBtnText}>Дивитись повністю</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    maxHeight: SCREEN_HEIGHT * 0.85,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 8,
  },
  handle: { width: 40, height: 4, backgroundColor: "#d1d5db", borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  imageBox: { width: "100%", aspectRatio: 4/3, backgroundColor: "#f3f4f6", position: "relative" },
  image: { width: "100%", height: "100%" },
  saleBadge: { position: "absolute", top: 12, left: 12, backgroundColor: "#dc2626", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  saleBadgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  heartBtn: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.4)", padding: 8, borderRadius: 20 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  name: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 },
  meta: { fontSize: 13, color: "#6b7280", marginBottom: 12 },
  prices: { gap: 6, marginBottom: 12 },
  priceRow: { flexDirection: "row", justifyContent: "space-between" },
  priceLabel: { fontSize: 14, color: "#6b7280" },
  priceValue: { fontSize: 15, fontWeight: "700", color: "#111827" },
  priceValueSale: { fontSize: 15, fontWeight: "700", color: "#dc2626" },
  lotsText: { fontSize: 13, color: "#10b981" },
  actions: { flexDirection: "row", gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  closeBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 8, backgroundColor: "#f3f4f6" },
  closeBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  viewBtn: { flex: 2, paddingVertical: 12, alignItems: "center", borderRadius: 8, backgroundColor: "#dc2626" },
  viewBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
```

### 2. `ProductCard.tsx` — додати `onLongPress` prop

```typescript
interface Props {
  product: WebCatalogProduct;
  onPress: (product: WebCatalogProduct) => void;
  onLongPress?: (product: WebCatalogProduct) => void; // NEW
  layout?: "grid" | "list";
}

// у TouchableOpacity:
<TouchableOpacity
  onPress={() => onPress(product)}
  onLongPress={() => onLongPress?.(product)}
  delayLongPress={500}
  ...
>
```

### 3. `CatalogScreen.tsx` — wire QuickViewModal

```typescript
const [quickViewProduct, setQuickViewProduct] = useState<WebCatalogProduct | null>(null);

// у renderItem ProductCard:
<ProductCard
  product={item}
  onPress={(p) => navigation.navigate("Product", { id: p.id })}
  onLongPress={(p) => setQuickViewProduct(p)}
  layout={layoutMode}
/>

// в кінці JSX:
<QuickViewModal
  product={quickViewProduct}
  onClose={() => setQuickViewProduct(null)}
  onViewFull={(p) => navigation.navigate("Product", { id: p.id })}
/>
```

### 4. `HomeScreen.tsx` — wire QuickViewModal у HorizontalProductRail

Та ж логіка: `quickViewProduct` state + onLongPress на ProductCard всередині `HorizontalProductRail`. Worker додає `onLongPress` prop у `HorizontalProductRail` і прокидує далі.

### 5. (Опціонально) `WishlistScreen.tsx` — wire QuickViewModal

Якщо легко інтегрується — додати long-press → quickview і там. Якщо потребує великих змін — out-of-scope.

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` ✅ (271 baseline, +0 нових)
4. ASCII-only deploy.ps1 ✅

---

## Out-of-scope

- Image carousel у QuickView (показуємо лише перше зображення)
- Add to cart прямо з QuickView (тільки wishlist toggle)
- Swipe-down to dismiss gesture (стандартний backdrop tap достатньо)
- Web QuickView changes (вже зроблено у S31)
- QuickView у Search results (Search screen — placeholder зараз)
- Animation polish (default Modal slide animation)

---

## Branch + commit + push

Branch: `claude/session-45-mobile-quickview`
Commit: `feat(s45): mobile QuickView modal — long-press on ProductCard for fast preview`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Тільки code → deploy.ps1.
