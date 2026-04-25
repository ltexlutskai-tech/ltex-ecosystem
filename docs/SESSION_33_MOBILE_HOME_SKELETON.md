# Session 33 — Worker Task: Mobile Home Screen Skeleton + 4-Tab Restructure

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (mobile-client UX redesign per user vision)
**Очікуваний ефорт:** 2-2.5 години
**Тип:** worker session (large / атомарний)

---

## Контекст

User описав mobile home (Rozetka-style) — банер, пошук, 4 quick кнопки, рекомендації, нижній bar з 4 tabs (Home/Search/Cart/More) + плаваюча кнопка месенджера.

Зараз `apps/mobile-client/` має 5 tabs (Каталог / Кошик / Замовлення / Чат / Профіль), без HomeScreen. S33 — **тільки UI скелет**: створюємо нові screens, рестрктуруємо tabs. **Без API / DB** — banner і recommendations показуємо static placeholder. Реальні дані прийдуть у S34. Chat FAB у S33 — static (без badge), badge додається у S35. Notifications screen — placeholder (S36 наповнить).

---

## Branch

`claude/session-33-mobile-home-skeleton` від main.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test` зелені (mobile-client має `typecheck: echo Skipping...` — це OK, інших mobile тестів немає)
2. **НЕ чіпати** web app (`apps/store/`) і admin
3. **НЕ редагувати** schema.prisma або API routes — S33 чисто client-side
4. **НЕ видаляти** existing screens (`CatalogScreen`, `ProductScreen`, `CartScreen`, `OrdersScreen`, `OrderDetailScreen`, `ChatScreen`, `ProfileScreen`, `ShipmentsScreen`, `LoginScreen`) — переюзаємо у нових стеках
5. **Auth guard** зберегти для Orders/Chat/Profile (всередині `MoreStack`)
6. Brand color: `#16a34a` (як уже використовується)
7. Ionicons icon set (як уже використовується)

---

## Tasks

### Task 1: Створити `HomeScreen`

**Новий файл:** `apps/mobile-client/src/screens/home/HomeScreen.tsx`

```tsx
import React from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

const BRAND_COLOR = "#16a34a";

// Quick action buttons configuration.
const QUICK_ACTIONS: {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  color: string;
}[] = [
  {
    key: "catalog",
    icon: "grid-outline",
    label: "Каталог",
    route: "Catalog",
    color: "#16a34a",
  },
  {
    key: "lots",
    icon: "cube-outline",
    label: "Лоти",
    route: "Lots",
    color: "#0284c7",
  },
  {
    key: "notifications",
    icon: "notifications-outline",
    label: "Сповіщення",
    route: "Notifications",
    color: "#dc2626",
  },
  {
    key: "wishlist",
    icon: "heart-outline",
    label: "Обране",
    route: "Wishlist",
    color: "#db2777",
  },
];

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [searchQuery, setSearchQuery] = React.useState("");

  const submitSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    navigation.getParent()?.navigate("SearchTab", {
      screen: "SearchMain",
      params: { q },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Banner placeholder — S34 will wire /api/mobile/banners */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>L-TEX</Text>
        <Text style={styles.bannerSubtitle}>
          Секонд хенд, сток, іграшки гуртом від 10 кг
        </Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Пошук товарів..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
        />
      </View>

      {/* Quick actions row */}
      <View style={styles.actionsRow}>
        {QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.actionButton}
            onPress={() => navigation.navigate(action.route)}
            accessibilityLabel={action.label}
          >
            <View
              style={[
                styles.actionIconWrap,
                { backgroundColor: `${action.color}15` },
              ]}
            >
              <Ionicons name={action.icon} size={28} color={action.color} />
            </View>
            <Text style={styles.actionLabel} numberOfLines={1}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recommendations placeholder — S34 will wire /api/mobile/recommendations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Рекомендації для вас</Text>
        <View style={styles.emptyRecsPlaceholder}>
          <Ionicons name="sparkles-outline" size={32} color="#d1d5db" />
          <Text style={styles.emptyRecsText}>
            Перегляньте товари у каталозі — ми покажемо схожі тут
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { paddingBottom: 96 /* room for FAB */ },
  banner: {
    margin: 16,
    padding: 24,
    borderRadius: 16,
    backgroundColor: BRAND_COLOR,
    alignItems: "center",
  },
  bannerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 2,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    marginTop: 8,
    textAlign: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  actionLabel: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
  },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  emptyRecsPlaceholder: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  emptyRecsText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
```

**Header bell icon** — додаємо через `headerRight` у HomeStack (Task 6, не тут).

### Task 2: Створити `SearchScreen`

**Новий файл:** `apps/mobile-client/src/screens/search/SearchScreen.tsx`

```tsx
import React from "react";
import { View, TextInput, FlatList, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
// Reuse existing mobile API client.
// Detailed search results will be wired in subsequent sessions; for S33
// this is a search input + minimal results list (basic GET to /api/catalog?q=).

export function SearchScreen() {
  const route = useRoute();
  const initialQ = (route.params as { q?: string } | undefined)?.q ?? "";
  const [query, setQuery] = React.useState(initialQ);
  const [results, setResults] = React.useState<
    { id: string; name: string; slug: string }[]
  >([]);

  React.useEffect(() => {
    if (initialQ) {
      // Submit initial query if navigated from Home with q param.
      void doSearch(initialQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  async function doSearch(q: string) {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL ?? ""}/api/search?q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setResults(data.products ?? []);
    } catch {
      // Silently fail in MVP.
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#9ca3af" />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Пошук товарів..."
          placeholderTextColor="#9ca3af"
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => doSearch(query)}
        />
      </View>

      {results.length === 0 ? (
        <Text style={styles.emptyText}>
          {query ? "Нічого не знайдено" : "Введіть запит для пошуку"}
        </Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{item.name}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  input: { flex: 1, fontSize: 15, color: "#111827" },
  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 32,
    fontSize: 14,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowTitle: { fontSize: 15, color: "#111827" },
});
```

**Note:** результати у MVP — лише назва. Картка + ціна — S34 коли підключимо ProductCard рендер.

### Task 3: Створити `MoreScreen`

**Новий файл:** `apps/mobile-client/src/screens/more/MoreScreen.tsx`

Список посилань на existing screens (orders, profile, shipments, chat, settings placeholder).

```tsx
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

interface MoreItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  color: string;
}

const ITEMS: MoreItem[] = [
  {
    key: "profile",
    icon: "person-outline",
    label: "Профіль",
    route: "Profile",
    color: "#16a34a",
  },
  {
    key: "orders",
    icon: "receipt-outline",
    label: "Замовлення",
    route: "Orders",
    color: "#0284c7",
  },
  {
    key: "chat",
    icon: "chatbubbles-outline",
    label: "Чат з менеджером",
    route: "Chat",
    color: "#7c3aed",
  },
  {
    key: "shipments",
    icon: "cube-outline",
    label: "Відправлення",
    route: "Shipments",
    color: "#d97706",
  },
  {
    key: "subscriptions",
    icon: "notifications-outline",
    label: "Підписки",
    route: "Subscriptions",
    color: "#db2777",
  },
  {
    key: "payments",
    icon: "wallet-outline",
    label: "Історія оплат",
    route: "PaymentsHistory",
    color: "#0891b2",
  },
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  return (
    <ScrollView style={styles.container}>
      {ITEMS.map((item, idx) => (
        <TouchableOpacity
          key={item.key}
          onPress={() => navigation.navigate(item.route)}
          style={[styles.row, idx === ITEMS.length - 1 && styles.rowLast]}
        >
          <View
            style={[styles.iconWrap, { backgroundColor: `${item.color}15` }]}
          >
            <Ionicons name={item.icon} size={22} color={item.color} />
          </View>
          <Text style={styles.label}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  label: { flex: 1, fontSize: 15, color: "#111827" },
});
```

### Task 4: Placeholder screens для нових routes

Створи прості placeholder-и (S34/S36 заповнять контентом). Кожен — окремий файл:

**`apps/mobile-client/src/screens/notifications/NotificationsScreen.tsx`**

```tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="notifications-outline" size={48} color="#d1d5db" />
      <Text style={styles.title}>Поки немає сповіщень</Text>
      <Text style={styles.subtitle}>
        Тут з&apos;являться оновлення про замовлення, нові товари та
        відеоогляди.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#f9fafb",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "600", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280", textAlign: "center" },
});
```

**`apps/mobile-client/src/screens/wishlist/WishlistScreen.tsx`**

Аналогічний placeholder з `heart-outline` icon і текстом "У обраному поки порожньо".

**`apps/mobile-client/src/screens/lots/LotsScreen.tsx`**

Аналогічний з `cube-outline` icon і текстом "Список лотів — скоро". (Реальні лоти — окрема сесія.)

### Task 5: Створити `MessengerFab` component (static, без badge)

**Новий файл:** `apps/mobile-client/src/components/MessengerFab.tsx`

```tsx
import React from "react";
import { TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

const BRAND_COLOR = "#16a34a";

export function MessengerFab() {
  const navigation = useNavigation<any>();
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => navigation.navigate("MoreTab", { screen: "Chat" })}
      accessibilityLabel="Чат з менеджером"
      activeOpacity={0.8}
    >
      <Ionicons name="chatbubbles" size={26} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    bottom: 72, // above tab bar (height 56) + small gap
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND_COLOR,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
});
```

S35 додасть unread badge (червоний кружечок з лічильником).

### Task 6: Restructure `AppNavigator`

**Файл:** `apps/mobile-client/src/navigation/AppNavigator.tsx`

**Зміни:**

1. **Імпорти нових screens:** HomeScreen, SearchScreen, MoreScreen, NotificationsScreen, WishlistScreen, LotsScreen, MessengerFab.

2. **Замінити 5 tabs на 4** у `MainTabs`: HomeTab, SearchTab, CartTab, MoreTab.

3. **Нові stacks:**
   - `HomeStackNavigator` — public:
     - `HomeMain` (HomeScreen) — з `headerRight` bell icon → navigate to `Notifications`
     - `Catalog` (existing CatalogScreen)
     - `ProductDetail` (existing ProductScreen)
     - `Lots` (LotsScreen)
     - `Wishlist` (WishlistScreen)
     - `Notifications` (NotificationsScreen)

   - `SearchStackNavigator` — public:
     - `SearchMain` (SearchScreen)
     - `ProductDetail` (existing ProductScreen)

   - `CartStackNavigator` — public, як зараз.

   - `MoreStackNavigator` — auth-guarded (як зараз ProfileStack):
     - `MoreMain` (MoreScreen)
     - `Profile` (existing ProfileScreen)
     - `Orders` (existing OrdersScreen) → `OrderDetail`
     - `Chat` (existing ChatScreen)
     - `Shipments` (existing ShipmentsScreen)
     - `Subscriptions`, `PaymentsHistory`, `Favorites` — existing PlaceholderScreen-и

4. **Tab icons:**

   ```ts
   const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
     HomeTab: "home-outline",
     SearchTab: "search-outline",
     CartTab: "cart-outline",
     MoreTab: "ellipsis-horizontal-outline",
   };
   ```

5. **Tab labels:** Головна / Пошук / Кошик / Ще

6. **Bell icon у HomeStack `HomeMain` screen options:**

   ```tsx
   options={({ navigation }) => ({
     title: "L-TEX",
     headerRight: () => (
       <TouchableOpacity
         onPress={() => navigation.navigate("Notifications")}
         style={{ paddingHorizontal: 12 }}
         accessibilityLabel="Сповіщення"
       >
         <Ionicons name="notifications-outline" size={22} color={BRAND_COLOR} />
       </TouchableOpacity>
     ),
   })}
   ```

7. **Renderувати `<MessengerFab />`** у `RootNavigator` поряд з `<RootStack.Navigator>`:

   ```tsx
   return (
     <View style={{ flex: 1 }}>
       <OfflineBanner />
       <RootStack.Navigator screenOptions={{ headerShown: false }}>
         <RootStack.Screen name="Main" component={MainTabs} />
       </RootStack.Navigator>
       <MessengerFab />
     </View>
   );
   ```

8. **Deep linking config** — оновити:

   ```ts
   config: {
     screens: {
       Main: {
         screens: {
           HomeTab: {
             screens: {
               HomeMain: "",
               Catalog: "catalog",
               ProductDetail: "product/:slug",
               Lots: "lots",
               Wishlist: "wishlist",
               Notifications: "notifications",
             },
           },
           SearchTab: { screens: { SearchMain: "search" } },
           CartTab: { screens: { CartMain: "cart" } },
           MoreTab: {
             screens: {
               MoreMain: "more",
               Profile: "profile",
               Orders: "orders",
               OrderDetail: "order/:orderId",
               Chat: "chat",
               Shipments: "shipments",
             },
           },
         },
       },
     },
   },
   ```

9. **Видалити** старі окремі stacks `OrdersStackNavigator`, `ChatStackNavigator` як top-level — їхній контент тепер всередині MoreStack.

   **Зберегти** `withAuthGuard` HOC і застосувати тільки до `MoreStackNavigator`.

   `HomeStack`, `SearchStack`, `CartStack` — public.

   Якщо неавторизований юзер тапне `Notifications` чи `Wishlist` всередині `HomeStack` — для S33 показуємо placeholder (не auth-guard). У S36 додамо auth-guard для Notifications якщо треба.

### Task 7: TypeScript та формат

- ParamList types для нових stacks (`HomeStackParamList`, `SearchStackParamList`, `MoreStackParamList`)
- Видалити старі `CatalogStackParamList`, `OrdersStackParamList`, `ProfileStackParamList` якщо більше не потрібні (або переюзати у нових)
- `import` шляхи через `@/screens/...`, як уже зараз
- Без emoji, без ASCII art

---

## Verification checklist

- [ ] `pnpm format:check` — PASS
- [ ] `pnpm -r typecheck` — PASS (mobile-client typecheck скрипт повертає `Skipping`, інші 5 пакетів типчекаються)
- [ ] `pnpm -r test` — PASS (243 tests без змін, mobile тестів немає)
- [ ] `pnpm build` — PASS (web build не зачеплено)
- [ ] git diff stat: ~6 нових файлів, 1 modified (AppNavigator.tsx)
- [ ] Apps/admin / packages / store не зачеплені

---

## Out of scope

- **Banner API + recommendations API** — S34 (потребує DB міграцію для ViewLog)
- **Chat FAB unread badge** — S35 (потребує `/api/mobile/chat/unread`)
- **Notifications реальні** — S36 (потребує Notification model migration + `/api/mobile/notifications` GET)
- Рендер ProductCard у SearchScreen (повна картка з фото + ціна) — переюзаємо existing `apps/mobile-client/src/components/ProductCard.tsx` у S34
- Push notifications setup (expo-notifications certificates) — окрема S37
- LotsScreen реальні дані — окрема сесія (потребує `/api/mobile/lots` endpoint)

---

## Commit strategy

```
feat(mobile): home screen + 4-tab restructure (Rozetka-style skeleton)

User vision per ecosystem chat 2026-04-25 — replace catalog-first
5-tab nav with home-first 4-tab layout matching Rozetka mobile UX:

New screens:
- HomeScreen: banner placeholder + search bar + 4 quick action
  buttons (Каталог / Лоти / Сповіщення / Обране) + recommendations
  empty-state placeholder
- SearchScreen: text search input wired to /api/search (basic
  result list; product cards in S34)
- MoreScreen: profile / orders / chat / shipments / subscriptions /
  payments link list (auth-guarded stack)
- NotificationsScreen, WishlistScreen, LotsScreen — placeholders
- MessengerFab: floating chat button (bottom-right, no badge yet;
  S35 wires unread count)

Navigation restructure:
- Bottom tabs: 5 (Каталог / Кошик / Замовлення / Чат / Профіль)
  → 4 (Головна / Пошук / Кошик / Ще)
- Catalog + ProductDetail moved into HomeStack
- Orders + Chat + Profile + Shipments moved into MoreStack
  (single auth guard)
- Bell icon header on HomeMain → navigates to Notifications
- Deep linking config updated for new tab structure

No DB / API changes (S34 wires banners + recommendations endpoints).
```

---

## Push

```bash
git push -u origin claude/session-33-mobile-home-skeleton
```

Звіт мені:

- Branch name (із суфіксом)
- Список нових файлів + 1 modified
- Чи `pnpm -r typecheck` чисто пройшов
- 1-2 line візуальне описання очікуваного UX (для smoke check на пристрої)
