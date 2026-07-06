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

## Відкрито (наступні кроки плану 7.0)

- Показ `source=site` у списку менеджерських замовлень (бейдж «Сайт») + фільтр —
  можна додати round-2.
- Блок 2 (клієнти), Блок 3 (товари/фото в системі), Блок 4 (дашборд візитів).
