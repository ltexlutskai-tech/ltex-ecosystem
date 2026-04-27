# Session 36 — Worker Task: Mobile Notifications Screen

**Створено orchestrator-ом:** 2026-04-27
**Пріоритет:** P1 (mobile parity — bell icon у HomeStack header веде на placeholder)
**Очікуваний ефорт:** 3-4 години
**Тип:** worker session

---

## Контекст

Зараз `apps/mobile-client/src/screens/notifications/NotificationsScreen.tsx` — placeholder. Bell icon у header HomeScreen (S33) вже навігує туди (`navigation.navigate("Notifications")`). Backend готовий: `notificationsApi.list()` у `apps/mobile-client/src/lib/api.ts` тягне з `/api/mobile/notifications`. Цей endpoint вже існує і повертає список.

S36 робить повноцінний екран:

- Список нотифікацій (нове замовлення, нове відео, system, etc.) з типами/іконками/часом
- Read state (mark as read on tap)
- Pull-to-refresh
- Empty state
- Tap on notification → deep link до relevant screen (order detail, product, chat)

---

## Branch

`claude/session-36-notifications-screen` від main.

---

## Hard rules

1. НЕ змінювати backend API `/api/mobile/notifications` без сильної потреби. Якщо потрібно нове поле (`isRead` toggle endpoint) — додай окремий method до existing route, не break існуючу schema.
2. НЕ робити WebSocket / SSE для notifications — пишемо поки на pull (refresh + polling). Real-time у наступну сесію.
3. CI green: 246 (або 249 якщо S35 уже merged) → +N test cases.
4. ASCII-only у `.ps1` (не чіпаємо).

---

## Перед стартом — research

Перш ніж писати код, worker МАЄ:

1. Прочитати `apps/store/app/api/mobile/notifications/route.ts` — зрозуміти shape response.
2. Знайти модель у `packages/db/prisma/schema.prisma` (`grep -n "model Notification\|model PushNotification" packages/db/prisma/schema.prisma`).
3. Перевірити чи backend підтримує `markAsRead` — якщо так, використовуй; якщо ні, додай PUT/PATCH method у той самий route file (НЕ створювати новий route).

Звіт у комміт-message: точна shape response, які типи notifications є.

---

## Tasks

### Task 1: Backend — mark as read

**Файл:** `apps/store/app/api/mobile/notifications/route.ts` (existing — додай PUT)

Додай PUT method:

```ts
export async function PUT(request: NextRequest) {
  const session = requireMobileSession(request);
  if (session instanceof NextResponse) return session;
  const { customerId } = session;

  const body = await request.json().catch(() => ({}));
  const { notificationId } = body as { notificationId?: string };

  if (notificationId) {
    // Mark single
    await prisma.notification.updateMany({
      where: { id: notificationId, customerId },
      data: { readAt: new Date() },
    });
  } else {
    // Mark all unread
    await prisma.notification.updateMany({
      where: { customerId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ success: true });
}
```

(Перевір точну назву моделі і поля — вище заглушка, worker знайде у schema.)

### Task 2: typed API methods

`apps/mobile-client/src/lib/api.ts` секція notificationsApi:

```ts
markAsRead: (notificationId?: string) =>
  api("/mobile/notifications", {
    method: "PUT",
    body: notificationId ? { notificationId } : {},
  }),
```

### Task 3: NotificationsScreen rewrite

`apps/mobile-client/src/screens/notifications/NotificationsScreen.tsx`

UI specs:

- Header (з navigation stack, не власний)
- `FlatList` з нотифікаціями, sorted by createdAt desc
- Кожна row:
  - Іконка по type (`order_status` → cube-outline, `new_video` → play-circle-outline, `chat_message` → chatbubble-outline, `system` → notifications-outline). Default fallback — `notifications-outline`.
  - Title bold, body звичайним
  - Час у форматі "5 хв тому" / "Сьогодні 14:30" / "Вчора 09:15" / "12 квіт" — реалізуй простий helper `formatRelative(date)` ALL inline у файлі (не створюй util без потреби).
  - Якщо `readAt === null` → синя точка зліва (16dp, синій `#2563eb`).
- Tap on row:
  - Викликати `notificationsApi.markAsRead(item.id)` (fire-and-forget)
  - Optimistic update local state
  - Deep link на relevant screen за payload:
    - `order_status` з `payload.orderId` → `MoreTab → Orders → OrderDetail`
    - `new_video` з `payload.productId` → `HomeTab → ProductDetail`
    - `chat_message` → `MoreTab → Chat`
    - `system` без navigation, тільки mark read
- Header right: іконка "галочка" → mark all read (`markAsRead()` без id) → optimistic state update
- Pull-to-refresh: re-fetch `notificationsApi.list()`
- Empty state: ikon + "Поки що сповіщень немає"
- Loading state: spinner

### Task 4: useNotifications hook (опційно — якщо S35 уже merged)

Якщо S35 (`useChatUnread`) уже на main, опційно додай аналог `useUnreadNotifications()` provider для tabBarBadge на HomeTab (bell icon header). НЕ обов'язково — можна відкласти.

### Task 5: Tests

`apps/store/app/api/mobile/notifications/route.test.ts` — додай 2 нові кейси для PUT:

- mark single з notificationId
- mark all без notificationId

(Можеш створити окремий test file для PUT якщо існуючий стає завеликий.)

### Task 6: Verification

- `pnpm format:check`
- `pnpm -r typecheck`
- `pnpm -r test`
- Manual: `Invoke-WebRequest -Method PUT -Body '{}' -ContentType 'application/json' -Headers @{ Authorization = 'Bearer <token>' } -Uri https://new.ltex.com.ua/api/mobile/notifications` (worker не може, дам user-у в commit message)

---

## Out of scope

- Push notification реєстрація — уже є з S5, не чіпати
- Real-time оновлення нотифікацій (SSE/WebSocket) — окрема сесія
- Notification preferences (toggle категорій) — окрема сесія
- Group notifications — окрема сесія

---

## Commit strategy

```
feat(mobile): notifications screen with mark-read + deep links (S36)

Replace placeholder NotificationsScreen with a proper FlatList of
backend notifications (icon + title + body + relative time + unread
dot). Tap routes to the relevant detail screen via the existing
payload (order_status → OrderDetail, new_video → ProductDetail,
chat_message → Chat). Header right action marks all as read.

Backend: extend /api/mobile/notifications with PUT to mark either
a single notification (by id) or all unread for the current customer.
```

---

## Push

```bash
git push -u origin claude/session-36-notifications-screen
```
