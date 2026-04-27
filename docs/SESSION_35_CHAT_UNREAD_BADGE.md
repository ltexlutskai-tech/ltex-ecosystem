# Session 35 — Worker Task: Mobile Chat Unread Badge

**Створено orchestrator-ом:** 2026-04-27
**Пріоритет:** P1 (mobile parity — користувач не бачить що менеджер відповів у чат)
**Очікуваний ефорт:** 2-3 години
**Тип:** worker session

---

## Контекст

Mobile app має `Chat` екран під MoreStack (`apps/mobile-client/src/screens/chat/ChatScreen.tsx`). Є вже SSE stream через `chatApi.streamUrl()` для real-time доставки і `chatApi.markRead()` для маркування прочитаного. Backend (`apps/store/app/api/mobile/chat/route.ts`) тримає `lastReadId` per customer.

Що відсутнє:

1. У 4-tab nav (Home / Search / Cart / More) немає індикатора що менеджер написав. Користувач відкриває "Ще" → "Чат" і лише тоді бачить нові повідомлення. Це втрачає leads.
2. На MoreScreen (entry до Chat) теж немає бейджа.

S35 додає red dot / лічильник на:

- Tab "Ще" (через `tabBarBadge` з `@react-navigation/bottom-tabs`)
- Рядок "Чат з менеджером" на MoreScreen
- Реагує на новi повідомлення без перезаходу в Chat (через polling АБО global SSE subscription).

---

## Branch

`claude/session-35-chat-unread-badge` від main.

---

## Hard rules

1. НЕ ламати існуючий ChatScreen (`apps/mobile-client/src/screens/chat/ChatScreen.tsx`) — лише екстракт state у global provider.
2. НЕ змінювати mobile chat API endpoints (`/api/mobile/chat`, `/api/mobile/chat/stream`).
3. НЕ додавати нові native deps — pure RN + наявні `@react-navigation/*` + `expo-secure-store`.
4. CI: 246 unit + format + typecheck + build green.
5. Polling fallback завжди має існувати — не покладатися на SSE-only (mobile chat stream може впасти на network change).

---

## Tasks

### Task 1: Backend — unread count endpoint

**Файл:** `apps/store/app/api/mobile/chat/unread/route.ts` (новий)

Окремий легкий endpoint для cheap polling — повертає тільки `count` без body повідомлень.

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { requireMobileSession } from "@/lib/mobile-auth";

export async function GET(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  // Find lastReadId (тримається у Customer.chatLastReadId або у ChatRead table —
  // worker, перевір актуальну схему перед написанням; у `prisma/schema.prisma`
  // знайди поле через `grep -n "lastRead" packages/db/prisma/schema.prisma`).
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { chatLastReadId: true },
  });

  const where: Record<string, unknown> = {
    customerId,
    direction: "to_customer", // only manager → customer messages count
  };
  if (customer?.chatLastReadId) {
    where.id = { gt: customer.chatLastReadId };
  }

  const count = await prisma.chatMessage.count({ where });
  return NextResponse.json({ count });
}
```

**Перевір:**

- Точне поле lastRead у `Customer` чи окремий `ChatRead` model — НЕ припускай. Використай `grep -n "chatLastRead\|ChatRead" packages/db/prisma/schema.prisma` перед коммітом.
- Точна назва поля для напрямку (`direction`, `senderRole`, etc.) — теж знайди у schema.
- Якщо схема використовує `id: { gt: ... }` — перевір що `id` це `cuid` (lexicographic) АБО використовуй `createdAt` порівняння замість.

### Task 2: typed API method

**Файл:** `apps/mobile-client/src/lib/api.ts`, секція `chatApi`:

```ts
export const chatApi = {
  // ... existing methods
  unreadCount: () => api<{ count: number }>("/mobile/chat/unread"),
};
```

### Task 3: ChatUnreadProvider (global state)

**Файл:** `apps/mobile-client/src/lib/chat-unread-provider.tsx` (новий)

Аналогічно `wishlist-provider.tsx`:

- Hook `useChatUnread()` повертає `{ count, refresh, markRead }`.
- Context value: `{ count: number, refresh: () => Promise<void>, markRead: () => void }`.
- Logic:
  - При mount + auth ready (з `useAuth().customerId`): polling `chatApi.unreadCount()` кожні **30с** ТІЛЬКИ коли logged in. Якщо `customerId === null` → count = 0, polling не запускати.
  - `refresh()` — manual force fetch (для pull-to-refresh у Chat).
  - `markRead()` — local optimistic set count = 0; backend call `chatApi.markRead()` має робити сам ChatScreen.
  - Cleanup: `clearInterval` на unmount, на logout.

**Wrap у AppNavigator:** одразу під `<WishlistProvider>` (потребує `useAuth()` з `AuthProvider`).

### Task 4: tabBarBadge на MoreTab

**Файл:** `apps/mobile-client/src/navigation/AppNavigator.tsx`

```tsx
function MainTabs() {
  const { count } = useChatUnread();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        /* existing */
      })}
    >
      {/* HomeTab, SearchTab, CartTab — без змін */}
      <Tab.Screen
        name="MoreTab"
        component={MoreStackNavigator}
        options={{
          tabBarLabel: "Ще",
          tabBarBadge: count > 0 ? (count > 9 ? "9+" : count) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#dc2626",
            color: "#fff",
            fontSize: 10,
          },
        }}
      />
    </Tab.Navigator>
  );
}
```

`useChatUnread()` має бути викликаний всередині JSX — Tab.Navigator вимагає що bottom tabs є потомком NavigationContainer і провайдерів.

### Task 5: Bage на MoreScreen "Чат з менеджером"

**Файл:** `apps/mobile-client/src/screens/more/MoreScreen.tsx`

Поряд з рядком "Чат з менеджером" (точну назву подивись у файлі) додай маленький червоний dot:

```tsx
const { count } = useChatUnread();
// ...
<View style={styles.row}>
  <Text>Чат з менеджером</Text>
  {count > 0 ? (
    <View style={styles.dot}>
      <Text style={styles.dotText}>{count > 9 ? "9+" : count}</Text>
    </View>
  ) : null}
</View>;
```

### Task 6: ChatScreen — викликати `markRead()` на mount + після SSE message

**Файл:** `apps/mobile-client/src/screens/chat/ChatScreen.tsx`

- Імпортуй `useChatUnread()`.
- На mount після успішного `chatApi.messages()` → `markRead()` (provider logic).
- Після успішного `chatApi.markRead()` (POST до бекенду) — `markRead()` локально (вже не потрібно, оптимістично уже відбулося).

### Task 7: Tests

**Файл:** `apps/store/app/api/mobile/chat/unread/route.test.ts` (новий)

- 1 тест: повертає `{ count: 0 }` коли немає нових повідомлень
- 1 тест: рахує тільки `to_customer` повідомлення після `chatLastReadId`
- 1 тест: 401 без auth (mock `requireMobileSession` → return NextResponse 401)

Mock prisma за патерном `apps/store/app/api/newsletter/route.test.ts`.

### Task 8: Verification

- `pnpm format:check`
- `pnpm -r typecheck`
- `pnpm -r test` — 249 baseline (246 + 3)
- `LANG=C grep -P '[^\x00-\x7f]' scripts/deploy.ps1` — 0 рядків (не чіпаємо, але гарантуємо)

---

## Out of scope

- Push notifications для нових chat-повідомлень (S36 робить notifications screen, push token registration уже є з S5)
- WebSocket replacing SSE — окрема задача (S35 використовує існуючий SSE stream без змін)
- Admin → mobile broadcast messages — окрема задача
- Read receipts (manager бачить що клієнт прочитав) — окрема задача

---

## Commit strategy

```
feat(mobile): chat unread badge on MoreTab + MoreScreen (S35)

Add a global ChatUnreadProvider that polls a new lightweight
GET /api/mobile/chat/unread endpoint (returns just { count }) every
30s when the user is signed in, and exposes the value to the
bottom-tab MoreTab as a tabBarBadge plus a red dot next to the
"Чат з менеджером" row on MoreScreen. ChatScreen calls markRead()
on mount so the badge clears as soon as the user opens the chat.
```

---

## Push

```bash
git push -u origin claude/session-35-chat-unread-badge
```
