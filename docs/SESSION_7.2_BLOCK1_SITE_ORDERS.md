# Session 7.2 — Блок 1: замовлення з сайту → система

Частина майстер-плану `docs/SESSION_7.0_ADMIN_OVERHAUL.md` (сайт = вітрина,
система = джерело правди). Замовлення з кошика сайту тепер заходять у
менеджерську систему змаршрутизованими, як чернетки, з нагадуванням.

## Рішення user

- **1A — маршрутизація на менеджера:** упізнаний клієнт (телефон збігся з
  `MgrClient`) → його торговий агент; новий/невідомий → мапа `MgrRegionAgent`
  (регіон→агент) за обраною областю; інакше — без агента (нагадування впаде на
  admin/owner).
- **2 (гібрид) — лоти:** за замовчуванням лоти НЕ бронюються (менеджер підбере).
  АЛЕ якщо клієнт обрав конкретний лот — він додається в замовлення, **лот
  бронюється** (`status → reserved`), а **штрихкод дублюється в коментар для
  складу** («Склад — відвантажити лоти: …»).
- **3A — статус:** заходить як `draft` (source=`site`) + авто-нагадування
  призначеному менеджеру «Обробити сайтове замовлення №… (клієнт …)».

## Зміни коду

- **Міграція `20260706_block1_site_orders`** (additive, idempotent):
  `orders.source TEXT DEFAULT 'manager'`; `mgr_reminders.order_id` + FK(SetNull)
  - index; enum `mgr_reminder_source += 'auto_site_order'`.
- **schema.prisma:** `Order.source` (+`@@index([source])`), `Order.reminders`
  relation; `MgrReminder.orderId` + `order` relation + index; новий enum-value.
- **`lib/manager/site-order-reminders.ts`** (новий): `createSiteOrderReminders`
  (агенту або fallback admin/owner) + `completeSiteOrderReminders` (при
  проведенні/скасуванні). Обидві best-effort, не кидають назовні.
- **`app/api/orders/route.ts`** (сайтовий чекаут): резолв `assignedAgentUserId`
  (phone-match → region-map → null), `status="draft"`, `source="site"`,
  штрихкоди лотів у коментар, виклик `createSiteOrderReminders` (fire-and-forget).
  Бронювання конкретних лотів лишилось як було.
- **`lib/validations.ts`:** `orderCustomerSchema += region?, city?`.
- **`app/(store)/cart/cart-client.tsx`:** дропдаун «Область» (`UA_REGIONS`) у
  формі замовлення → шлеться як `customer.region`.
- **`app/api/v1/manager/orders/[id]/route.ts`:** при переході в `posted`/
  `cancelled` — `completeSiteOrderReminders(id)`.

## Тести

`app/api/orders/route.test.ts` +3 інтеграційні (routing agent / region-map /
unassigned + draft+site + бронь + штрихкод-у-коментарі). Усього по зачеплених
файлах: 81 pass. Typecheck + prettier чисті.

## ⚠️ Деплой

`git pull` → `prisma migrate deploy` (`20260706_block1_site_orders`) →
`prisma generate` → `deploy.ps1 -SkipInstall`. Мапу регіон→агент заповнити в
`/manager/admin/region-agents` (інакше нові клієнти йдуть у fallback на
admin/owner).

## Round-2 (зроблено)

- **Бейдж «Сайт»** у списку менеджерських замовлень (`orders-row`) + на картці
  замовлення (`[id]/page.tsx`), коли `source="site"`.
- **Фільтр «Джерело»** (Усі / Сайт / Ручні) у тулбарі списку: `buildOrdersWhere`
  += `source` (`site` → `source="site"`; `manual` → `source ≠ "site"`),
  прокинуто через filter-state + GET `/api/v1/manager/orders` + page.tsx.
- **Прибрано вкладку «Замовлення» з адмінки сайту** (все керування — у CRM):
  видалено `app/admin/orders/*` + `components/admin/orders-badge.tsx`, прибрано
  пункт із `components/admin/sidebar.tsx`; дзвіночок (`notification-bell`) і
  Telegram/Viber-сповіщення (`lib/notifications.ts`) тепер лінкують на
  `/manager/orders?source=site`. Дашборд-аналітика замовлень (read-only) лишена.

## Блок 2 — клієнти з сайту → довідник CRM (зроблено)

Рішення user: 1 так (авто-створення), 2 так (видимість за агентом), 3 так
(прибрати вкладку «Клієнти» з адмінки).

- **`lib/manager/site-client.ts`** (новий): `resolveOrCreateSiteClient` —
  телефон збігся → наявний MgrClient; інакше створює MgrClient (агент за мапою
  область→агент) + запис у таймлайн «зареєстрований із сайту». Best-effort.
- **`app/api/orders/route.ts`:** чекаут кличе `resolveOrCreateSiteClient` (замість
  inline phone-match+region) → `Order.assignedAgentUserId`.
- **Фікс видимості (`buildOrdersWhere` + `viewerUserId`):** для менеджера скоуп
  тепер `OR(власний code1C, assignedAgentUserId === viewer)` через `where.AND`
  (без viewerUserId — стара поведінка). Прокинуто в GET-роут і page.tsx; знято
  short-circuit «0 клієнтів → порожньо» (менеджер може бути агентом сайтових
  замовлень без code1C). `canViewOrder` теж поважає `assignedAgentUserId`.
- **Прибрано вкладку «Клієнти» з адмінки:** видалено `app/admin/customers/*` +
  пункт сайдбару.
- Тести: +viewerUserId-скоуп (buildOrdersWhere) + оновлено 2 GET-тести під
  AND/OR-скоуп + Block-1 route-тести переведено на мок `resolveOrCreateSiteClient`.
  917 pass по зачепленій площі; typecheck + prettier чисті. Нових міграцій НЕМАЄ.

**Відомий хвіст:** сайтовий клієнт без `code1C` не показує свої замовлення на
CRM-картці (order-tab матчить по code1C) — замовлення видно у глобальному списку
за агентом. Лінк MgrClient↔Order для site-клієнтів — окремий follow-up.

## Відкрито (наступні кроки плану 7.0)

- Блок 3 (товари/категорії/фото в системі — потребує рішення по ролях),
  Блок 4 (дашборд візитів).
