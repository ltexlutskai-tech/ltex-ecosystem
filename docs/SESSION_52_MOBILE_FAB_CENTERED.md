# Session 52 — Worker Task: Mobile FAB Redesign (centered + unread badge)

**Створено orchestrator-ом:** 2026-04-29
**Пріоритет:** P2 (UX — chat discovery)
**Очікуваний ефорт:** 1-2 години
**Тип:** worker session

---

## Контекст

Зараз `MessengerFab` (`apps/mobile-client/src/components/MessengerFab.tsx`) — кругла зелена кнопка `position: absolute` у нижньому правому куті (`right: 16, bottom: 72`). Для wholesale UX чат — primary CTA, його треба зробити **акцентом** у tab bar.

S52 переносить FAB у **центр між нижніми кнопками**, схоже на pattern Instagram/TikTok center button:

1. FAB по горизонтальному центру екрану
2. Виходить трохи **вище** за tab bar (raised, notched style — частково перекриває верхній край tab bar)
3. Колір лишається зелений `#16a34a` (BRAND_COLOR)
4. **Unread badge** — червоний кружечок з кількістю непрочитаних повідомлень менеджера. Читається з `useChatUnread()` (S35 hook вже існує).

Tab bar має 4 існуючі вкладки (Головна / Пошук / Кошик / Ще). FAB **не** замінює одну з них — він лишається як 5-й елемент по центру, поверх tab bar (overlay).

---

## Branch

`claude/session-52-mobile-fab-centered` від main.

---

## Hard rules

1. НЕ міняти `expo`/`react-native`/`@react-navigation` версій.
2. НЕ міняти кількість табів (лишається 4).
3. НЕ міняти колір FAB — `#16a34a`.
4. FAB — `position: absolute`, по центру екрану горизонтально (`alignSelf: "center"` всередині container з `width: "100%"`).
5. Unread badge — `useChatUnread()` (S35), показує count > 0 з cap "9+", червоний `#dc2626`.
6. FAB має тінь / elevation для візуального підняття над tab bar.
7. `accessibilityLabel` лишається "Чат з менеджером" (можна додавати кількість unread).
8. CI: 294 unit baseline + format + typecheck + build green. Тести skip (mobile only).

---

## Файли

### `apps/mobile-client/src/components/MessengerFab.tsx` — переписати

```typescript
import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useChatUnread } from "@/lib/chat-unread";

const BRAND_COLOR = "#16a34a";
const BADGE_COLOR = "#dc2626";

export function MessengerFab() {
  const navigation = useNavigation<any>();
  const { count } = useChatUnread();
  const badgeText = count > 0 ? (count > 9 ? "9+" : String(count)) : null;
  const a11yLabel =
    count > 0
      ? `Чат з менеджером, ${count} непрочитаних повідомлень`
      : "Чат з менеджером";

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate("MoreTab", { screen: "Chat" })}
        accessibilityLabel={a11yLabel}
        activeOpacity={0.85}
      >
        <Ionicons name="chatbubbles" size={28} color="#fff" />
        {badgeText && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    // Tab bar height — 56, FAB має half-overlap верхнього краю.
    // bottom = tabBarHeight (56) - FAB.height/2 (32) = 24, плюс safe-area insets.
    bottom: 24,
    alignItems: "center",
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: BRAND_COLOR,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    // Border ring для візуального відриву від tab bar
    borderWidth: 3,
    borderColor: "#fff",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: BADGE_COLOR,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
```

**Зауваження:**

- `pointerEvents="box-none"` на container — щоб тапи проходили крізь нього коли FAB не покривати область (інакше container блокує tap на tab bar).
- `borderWidth: 3, borderColor: "#fff"` — створює "вирізаний" вигляд як на Instagram (notched FAB).
- Badge `borderColor: "#fff"` — щоб badge виглядав вирізаним з FAB.

### Видалити дублікат бейджа на MoreTab + fix tab pop-to-root

Зараз у `AppNavigator.tsx:362-371` MoreTab має `tabBarBadge: moreBadge`. Дублюється з FAB-бейджем. Видалити цей `tabBarBadge` блок (chat unread тепер на FAB).

**Bug fix (regression):** Коли FAB → ChatScreen, MoreStack тримає Chat як top. Наступний tap на "Ще" tab лишає user-а на ChatScreen замість повернення у MoreScreen menu. Додати `tabPress` listener що pop-ить stack до root коли user тапає вже focused tab:

```typescript
import { CommonActions } from "@react-navigation/native";

<Tab.Screen
  name="MoreTab"
  component={MoreStackNavigator}
  options={{ tabBarLabel: "Ще" }}
  listeners={({ navigation, route }) => ({
    tabPress: (e) => {
      // Якщо user вже на MoreTab і у стеку є screens > MoreScreen,
      // popToTop замість default behavior
      const state = navigation.getState();
      const tabRoute = state.routes.find((r: any) => r.name === "MoreTab");
      const stackIndex = (tabRoute as any)?.state?.index ?? 0;
      const isFocused = state.index === state.routes.indexOf(tabRoute as any);
      if (isFocused && stackIndex > 0) {
        e.preventDefault();
        navigation.dispatch(
          CommonActions.navigate({
            name: "MoreTab",
            params: { screen: "MoreScreen" },
          }),
        );
      }
    },
  })}
/>
```

Те саме треба зробити для **усіх 4 tabs** (HomeTab / SearchTab / CartTab / MoreTab) — щоб поведінка була передбачуваною: tap focused tab → reset stack до root цього tab. Worker екстрактить логіку у helper.

### `apps/mobile-client/src/screens/more/MoreScreen.tsx` — лишити inline бейдж

Бейдж біля рядка "Чат з менеджером" на MoreScreen залишається (S35). Він не дублює FAB, бо MoreScreen це окремий екран коли user уже у "Ще".

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` 294/294 ✅ (без нових тестів — mobile-only)
4. ASCII-only `deploy.ps1` ✅

Manual QA після merge (orchestrator + user):

- FAB по центру, з border-ring і shadow
- Tap на FAB → ChatScreen
- Бейдж появляється з unread count, ховається коли count = 0
- Tab bar не зламано — інші tabs клікаються нормально
- Безпечні зони на iPhone з notch / home indicator не перекривають FAB

---

## Out-of-scope

- Animation (pulse / scale on press) — стандартний `activeOpacity` достатньо
- Haptic feedback — окрема задача
- 5-й tab з blank component для центру (як у TikTok) — поточний overlay підхід простіший і фігурно ідентичний
- Customizable FAB position via Settings — користь маленька

---

## Branch + commit + push

Branch: `claude/session-52-mobile-fab-centered`
Commit: `feat(s52): center mobile FAB with unread badge over tab bar`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Без DB migration. Прямий `deploy.ps1`. Або mobile-only — без redeploy серверу (це Expo app зміна, не сервер).
