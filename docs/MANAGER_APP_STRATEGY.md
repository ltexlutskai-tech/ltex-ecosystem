# Manager Workstation — Strategy

**Status:** Draft v2 (2026-05-12). Owner: orchestrator session.
**v2 changes:** dropped Supabase Auth for manager app (own users table + bcrypt + HMAC JWT). Existing admin/storage Supabase usage deferred to V2 phase-out roadmap. Simplified settings UI — викинуто всі 1С toggles, лишилось мінімум.
**Replaces:** 1C `MobileAgentLTEX` v1.15.3 (Android-only, SOAP-bound).
**Companion docs:** [`MOBILE_APP_ANALYSIS.md`](../MOBILE_APP_ANALYSIS.md) — повний аудит 1С-конфігурацій; [`M1_BACKLOG.md`](M1_BACKLOG.md) — посесійний backlog з acceptance criteria.

---

## 1. Vision

Робоче місце менеджера L-TEX, що замінює 1С Mobile Platform-додаток. Покриває: клієнти, товари, замовлення, реалізація+оплата, каса, маршрути, презентації, чат, нагадування, кілометраж, гео-логування, курси валют, ШК-сканування. Працює як **веб-додаток у браузері** (фаза 1), пізніше пакується у **Tauri-installer для Windows + macOS** (фаза 2) з нативними нотифікаціями + system-tray + auto-update. Notifications дублюються у **Telegram bot per-manager DM** як failover і як basic-канал коли застосунок закритий.

## 2. Архітектурні рішення

| #   | Питання        | Рішення                                                               | Підстава                                                                                                                                                                                                      |
| --- | -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Shell          | **Web-first → Tauri wrap (M1.11)**                                    | Зменшити initial risk; web-функціонал стабілізується, потім нативний інсталер.                                                                                                                                |
| 2   | 1С integration | **Hybrid: read snapshot, write SOAP-proxy**                           | `MOBILE_APP_ANALYSIS.md §8.7`. Швидкий UI читає з локального Postgres-snapshot; write-операції одразу проксі у `MobileExchange.1cws` з idempotency-key. Background `services/manager-sync/` оновлює snapshot. |
| 3   | Auth           | **Self-hosted: own `users` table + bcrypt + HMAC JWT**                | Жодного Supabase для manager app. Password reset через власний email-токен (Resend SMTP уже у проді).                                                                                                         |
| 4   | Notifications  | **Tauri native push + Telegram DM** паралельно                        | Workstation відкритий → OS push; закритий → Telegram DM на телефон менеджера. Telegram bot уже існує (`services/telegram-bot`).                                                                               |
| 5   | Storage        | **Local volume `E:\ltex-storage\`** для нових файлів                  | Manager-uploads — на наш Windows server через Next.js Route Handler. Existing banners/product photos на Supabase Storage лишаються до окремої V2-міграції (див. §12).                                         |
| 6   | Settings UI    | **Мінімум:** profile + Telegram pair + notification channels + logout | Поточний 1С `ФормаВводаПароля` має 7 toggles які менеджери не міняють — викинуто. Auto-sync курсів/борг/залишків тепер default-on без UI.                                                                     |

## 3. Tech stack

| Шар            | Технологія                                                                            | Примітка                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | Next.js 15 App Router + React 19 + Tailwind + shadcn/ui                               | Сегмент `apps/store/app/manager/*` усередині існуючого monorepo                                                                        |
| Auth           | Власна таблиця `users` + `bcryptjs` (cost=12) + HMAC JWT через `lib/mobile-auth.ts`   | Жодного Supabase Auth. Access 15хв + refresh 30д. Password reset через email-link (token у власному `password_reset_tokens`, сесія 1г) |
| Email          | **Resend** (уже у проді — `lib/email.ts`)                                             | Used for password reset + критичних alerts                                                                                             |
| State (server) | TanStack Query                                                                        | Cache invalidation через SSE events                                                                                                    |
| Real-time      | Server-Sent Events через `/api/v1/manager/stream`                                     | Resume via `Last-Event-ID` header                                                                                                      |
| DB             | Той самий PostgreSQL 16 (local Windows Server, `E:\PostgreSQL\16`) + Prisma           | Нові таблиці з префіксом `mgr_`                                                                                                        |
| File storage   | Local volume `E:\ltex-storage\manager\` через `/api/v1/manager/files/*` Route Handler | Stream-served з content-type sniff, antimalware-free for trusted internal use                                                          |
| Sync worker    | Новий `services/manager-sync/` (Node, окрема PM2 instance)                            | Polls `MobileExchange.1cws` кожні 60c, пише дельти у `mgr_*` snapshot tables                                                           |
| Notifications  | Telegram bot DM + Tauri OS push                                                       | `services/telegram-bot` розширюється `/start_manager` + DM-send функцією                                                               |
| Desktop wrap   | Tauri 2 (M1.11)                                                                       | Rust shell ~10 МБ; auto-update через GitHub Releases                                                                                   |
| Build          | Tauri власний `tauri build`; CI matrix windows-latest + macos-latest у M1.11          | macOS code-signing — окрема історія (self-signed DMG для internal distribution)                                                        |

## 4. Identity модель

**Принцип:** одна таблиця `User` для всіх internal-користувачів (manager, senior_manager, admin). У майбутньому існуючі Supabase-admin-аккаунти мігрують у цю саму таблицю (див. §12). Customers — окрема існуюча таблиця `customers`, **не торкаємо**.

### 4.1. DB additions

```prisma
model User {
  id              String   @id @default(cuid())
  email           String   @unique
  passwordHash    String                          // bcryptjs $2b$ hash, cost=12
  fullName        String
  role            UserRole @default(manager)
  isActive        Boolean  @default(true)

  // 1C-bridge (manager-specific, null для non-manager)
  code1C          String?  @unique                 // ТорговыеАгенты.Код
  warehouseId1C   String?                          // склад менеджера у ЦБ

  // Telegram bot bridge
  telegramChatId    String? @unique                // null поки не виконано /start_manager
  telegramLinkToken String? @unique                // one-time token для pairing
  notifyChannels    String[] @default(["push","telegram"])

  // Audit
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastSeenAt      DateTime?
  lastLoginIp     String?

  // Lockout (захист від brute-force)
  failedLoginCount Int      @default(0)
  lockedUntil      DateTime?

  // relations
  refreshTokens   UserRefreshToken[]
  passwordResets  PasswordResetToken[]
  assignedClients ClientAssignment[]

  @@map("users")
}

enum UserRole {
  manager
  senior_manager
  admin
}

model UserRefreshToken {
  id          String   @id @default(cuid())
  userId      String
  tokenHash   String   @unique                     // sha256(token), не plaintext
  expiresAt   DateTime
  revokedAt   DateTime?
  userAgent   String?
  ipAddress   String?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@map("user_refresh_tokens")
}

model PasswordResetToken {
  id          String   @id @default(cuid())
  userId      String
  tokenHash   String   @unique                     // sha256(token)
  expiresAt   DateTime                             // 1 година від створення
  usedAt      DateTime?                            // null = ще не використаний
  requestedIp String?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, usedAt])
  @@map("password_reset_tokens")
}

model ClientAssignment {
  id          String   @id @default(cuid())
  userId      String                               // hto веде клієнта
  customerId  String                               // FK на існуючу customers
  assignedAt  DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, customerId])
  @@map("client_assignments")
}
```

### 4.2. Auth flow

```
POST /api/v1/manager/auth/login              { email, password }
  → if lockedUntil > now → 423 Locked
  → bcrypt.compare(password, user.passwordHash)
  → on fail:  failedLoginCount++; if >=5 → lockedUntil = now+15m; return 401
  → on pass:  reset counters, set lastSeenAt + lastLoginIp
  → generate accessToken (HMAC JWT, payload { sub: userId, role, exp: 15m })
  → generate refreshToken (32 bytes), store sha256 in UserRefreshToken (30d)
  → 200 { accessToken, refreshToken, user: { id, fullName, role, telegramLinked: telegramChatId !== null } }

POST /api/v1/manager/auth/refresh            { refreshToken }
  → lookup by sha256, validate not revoked/expired
  → rotate: revoke old + issue new refresh + new access
POST /api/v1/manager/auth/logout             { refreshToken } → 204
GET  /api/v1/manager/auth/me                 Bearer <access> → { user }

POST /api/v1/manager/auth/password-reset/request  { email }
  → завжди 202 (anti-enumeration — same response if user existing or not)
  → if user found + active: generate 32-byte token, store sha256 + 1h expiry
  → send Resend email з link https://new.ltex.com.ua/manager/reset?token=<plain>

POST /api/v1/manager/auth/password-reset/confirm  { token, newPassword }
  → lookup by sha256(token), validate not used/expired
  → bcrypt.hash(newPassword, 12) → User.passwordHash
  → revoke all refresh tokens of this user
  → mark PasswordResetToken.usedAt = now
  → 204
```

JWT: HS256 with `MANAGER_JWT_SECRET` (мінімум 32 байти). Verify через existing `lib/mobile-auth.ts::verifyJwt()` pattern (extracted to shared `lib/jwt.ts`).

### 4.3. Seed першого admin

Скрипт `scripts/seed-admin-user.ts` — один раз запускається на сервері з env vars:

```bash
SEED_ADMIN_EMAIL=ltex.lutsk.ai@gmail.com \
SEED_ADMIN_PASSWORD=<тимчасовий> \
SEED_ADMIN_NAME="Адміністратор L-TEX" \
pnpm tsx scripts/seed-admin-user.ts
```

Створює `User { role: admin, email: "ltex.lutsk.ai@gmail.com" }`. Цей admin потім через `/manager/admin/users` UI запрошує менеджерів (вписує email+ПІБ → автогенерується випадковий пароль → відсилається invite-email з посиланням "Задайте ваш пароль" → менеджер переходить → задає свій пароль → логіниться).

### 4.4. Whitelist через invite

**Принцип:** менеджер не може зареєструватись сам. У систему потрапляють тільки ті email-адреси, які admin особисто додав через UI. Це і є whitelist — таблиця `users` сама собою.

Login flow:

- Email є у `users` + пароль вірний + `isActive=true` → OK
- Email є у `users` + пароль невірний → counter++, після 5 fails — lockout 15 хв
- Email є у `users` + `isActive=false` → "обліковий запис вимкнено"
- Email **немає** у `users` → "невірний email або пароль" (та сама відповідь що при невірному паролі — anti-enumeration, не виявляємо чи user існує)

### 4.5. Локалізовані рішення (зафіксовано з user 2026-05-12)

- **Очікувано 5-10 менеджерів** у v1 — admin invite-flow реалізується одразу в M1.1 (не self-service registration).
- **Telegram сповіщення з нуля** — не існує legacy спільного каналу для менеджерів, тому новий код шле тільки в особисті DM (per-manager); якщо менеджер ще не виконав `/start_manager` — повідомлення тимчасово не доходить до Telegram (але є в-app + email digest fallback).
- **Перший admin email:** `ltex.lutsk.ai@gmail.com`.

## 5. Data flow (read/write)

### 5.1. Read-path

```
Manager UI
   ↓ TanStack Query
GET /api/v1/manager/clients?search=ТОВ
   ↓ Prisma read
mgr_clients_snapshot (local Postgres)   ← refreshed every 60s by services/manager-sync
   ↑ SOAP poll (delta by modifiedSince)
1С MobileExchange.1cws::ВыгрузитьИзменения(...Контрагенты)
```

Background sync worker pulls deltas з:

- `Catalog.Контрагенты` → `mgr_clients`
- `Catalog.Номенклатура` + `Catalog.ХарактеристикиНоменклатуры` → `mgr_products` + `mgr_lots`
- `РегистрСведений.ЦеныНоменклатуры` → `mgr_prices`
- `РегистрСведений.ОстаткиТоваров` → `mgr_balances`
- `Catalog.Маршруты` → `mgr_routes`
- `РегистрСведений.Виборка з Контрагенты для CRM` → `mgr_client_timeline`

Period: 60s default, 5s для balance-table (для уникнення race у бронюваннях).

### 5.2. Write-path

```
Manager UI
   ↓ optimistic mutation (TanStack)
POST /api/v1/manager/orders   Idempotency-Key: <uuid>
   ↓
1) write draft to mgr_orders_outbox (status=pending)
2) async: invoke MobileExchange.1cws::ОбработатьПакетДанных(serialized)
3) on success: status=synced + write back 1C ID
4) on error: status=failed + log → UI retry button
```

Conflict detection: при write-успіху, sync worker помічає `Контрагенты.КонтрольВерсии` різницю — log у `mgr_conflict_log` + emit SSE `conflict.detected` → UI banner "ваші зміни X перезаписані сервером".

## 6. Notifications

### 6.1. Тригери (events що generate notification)

| Event                                                            | Source                                                     | Default channels |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------- |
| `order.new` (хтось створив order де ти responsible)              | sync-worker detects new ЗаказПокупателя.Ответственный = me | push + telegram  |
| `chat.message` (хтось пише у chat-group де ти учасник)           | new row у `mgr_chat_messages`                              | push + telegram  |
| `reminder.fire` (запланована подія)                              | cron на `mgr_reminders.firesAt ≤ now`                      | push + telegram  |
| `client.debt_overdue` (клієнт пройшов поріг боргу)               | sync-worker on `Контрагенты.ПросроченныйДолг` change       | telegram         |
| `lot.reserved_by_other` (хтось забронював лот за яким ти стежиш) | sync-worker on `Резервы` change                            | push + telegram  |
| `route.assigned` (старший менеджер призначив тобі маршрут)       | sync-worker on `МаршрутныйЛист.Ответственный`              | push + telegram  |

User per-channel toggle у settings (`manager.notifyChannels`). Per-event preferences — V2.

### 6.2. Telegram bot extension

Існуючий `services/telegram-bot`:

- Команда `/start_manager <token>` — менеджер копіює token з workstation, бот connects `Manager.telegramChatId`.
- Команда `/today` — повертає сьогоднішні замовлення менеджера (із snapshot).
- Команда `/debt <code>` — борг клієнта `code`.
- Команда `/help` — список команд.
- Inline-кнопки під push-нотифікаціями: `[Відкрити у workstation]` (deep-link `ltex-manager://order/{id}`), `[Прийняти]`, `[Відхилити]`.

### 6.3. Tauri native push (M1.11+)

`tauri-plugin-notification` шле OS push коли workstation відкритий. Коли згорнутий — той самий plugin. Коли закритий — Telegram дублює. Deep-link `ltex-manager://...` опрацьовується через `tauri-plugin-deep-link`.

## 7. Phased rollout

Детальний backlog — `docs/M1_BACKLOG.md`. Огляд:

| Phase                           | Сесії            | Залежності | Ціль                                                         |
| ------------------------------- | ---------------- | ---------- | ------------------------------------------------------------ |
| **0**                           | M1.0             | —          | Strategy + backlog (ця сесія)                                |
| **1 — Foundation**              | M1.1, M1.2       | M1.0       | Manager DB, auth, workstation shell                          |
| **2 — Read paths**              | M1.3, M1.4       | M1.2       | Clients view, products + ШК                                  |
| **3 — Write paths**             | M1.5, M1.6       | M1.4       | Orders, sales+payments                                       |
| **4 — Operations**              | M1.7, M1.8, M1.9 | M1.5       | Routes, chat, reminders+geo                                  |
| **5 — Notifications + Desktop** | M1.10, M1.11     | M1.8       | Telegram bot extension, Tauri wrap                           |
| **6 — Resilience**              | M1.12            | M1.5       | Offline queue + retry                                        |
| **V2**                          | M2.x             | —          | Returns, presentations-to-Viber, reports, batch reservations |

## 8. Working agreement

### 8.1. Хто що робить

| Роль          | Хто                   | Що                                                                                         |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| Product owner | User                  | Дає скрін поточного 1С-екрану, описує "що змінити / залишити / додати"                     |
| Orchestrator  | Цей сесійний Claude   | Аналізує скріни + аудит звіту → пише worker-spec у `docs/SESSION_M1.N_*.md` → merge у main |
| Worker        | Окрема Claude session | Виконує spec у `claude/manager-mN-*` branch → пушить → НЕ мерджить                         |

### 8.2. Per-session loop

```
1. Orchestrator оголошує: "наступна сесія M1.N — Х, потрібні скріни А/Б/В з 1С"
2. User → пересилає скріни + freeform-описує зміни
3. Orchestrator → пише docs/SESSION_M1.N_*.md (за template SESSION_85_E2E_CUSTOMER_FLOW.md)
4. User запускає worker session з посиланням на spec
5. Worker → пушить claude/manager-mN-* → нотифікація orchestrator-у
6. Orchestrator → review diff → merge у main (з 403-fallback) → update HISTORY.md
```

### 8.3. Hard rules

1. **DO NOT touch** `apps/mobile-client/` (customer Expo app — окремий продукт).
2. **DO NOT break** `/admin/*` web admin — він залишається primary tool до M1.11.
3. **DO NOT change** existing `customers` / `orders` / `lots` / `products` schemas. Усе manager-specific — у нових `Manager*` / `mgr_*` tables.
4. **DO NOT** хардкодити 1С credentials у фронтенд — усе через server-side env vars.
5. **DO NOT** запускати real 1С SOAP-виклики з worker session без stub-сервісу (бо worker не має VPN до 1С). M1.1-M1.10 розробляються проти `services/manager-sync/__mocks__/`.
6. **DO** використовувати `@ltex/shared`, `@ltex/ui`, `@ltex/db` (не вводити паралельні packages).
7. **DO** йти за CLAUDE.md push-protocol: orchestrator → main з 403-fallback на `claude/m1-orch-merge`.

## 9. Out of scope для M1 (визначено явно)

- **iOS native** — Tauri тільки для Win+macOS. Для iOS — окрема історія пізніше.
- **Друк чеків** — Bluetooth-принтери не у v1. V2 через Web Bluetooth API.
- **Видавання знижок** — лишається у 1С Director-role; manager-app дисплейс % але не може override (V2).
- **Бронювання партій** — V2 (потребує live race-detection у `mgr_lots`).
- **Звіти у форматі 1С-СКД** — V2; в v1 simplified dashboard.
- **Конкуренти-ціни** (поле `ІншіПостачальники` у Заказ) — V2.
- **Міграція existing `/admin/*` з Supabase Auth** — див. §11 V2 phase-out. Existing admin працює і не ламається.
- **Міграція existing banners/products image-storage** — Supabase Storage лишається до §11.
- **Налаштувальна форма як у 1С `ФормаВводаПароля`** — викинуто; auto-defaults замінюють всі 7 toggles (див. §6).

## 10. Risks + mitigations

| Ризик                                                   | Severity | Mitigation                                                                                                                                                                                   |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1С SOAP падає, sync worker не може писати               | High     | Outbox-pattern: `mgr_orders_outbox(status)` retries з exp backoff (1м/5м/30м/2г/6г), як S70 EmailJob                                                                                         |
| MobileExchange.1cws хардкоджений пароль викрадено       | Medium   | Не expose у фронт; зберігати у `apps/store/.env` як `MOBILE_EXCHANGE_SOAP_PASSWORD`; rotate раз на 90 днів                                                                                   |
| Race: 2 менеджери намагаються забронювати той самий лот | Medium   | Pessimistic lock у `mgr_lots.reservedByManagerId` + SOAP write protected by 1С transaction                                                                                                   |
| Tauri auto-update ламає running session                 | Low      | `tauri-plugin-updater` показує UI prompt, never silent restart                                                                                                                               |
| Telegram bot rate-limit (FloodWait)                     | Low      | Existing `services/telegram-bot` уже має retry; per-manager DM ≤ 30 msgs/sec ліміт безпечно                                                                                                  |
| Manager забув email — не може скинути пароль            | Low      | Власний reset через Resend email-link. Якщо втратив доступ до email — admin role у `/manager/users` сторінці може force-reset через копіювання тимчасового пароля (M1.1)                     |
| Brute-force на login endpoint                           | Medium   | bcrypt cost=12 (~250ms per check); `failedLoginCount` lockout після 5 спроб на 15 хвилин; rate-limit 10/min/IP на `/auth/login`                                                              |
| Втрата `MANAGER_JWT_SECRET` (rotation)                  | Medium   | Token-version у JWT payload; при rotate — increment `User.tokenVersion`, JWT з minor version stays valid 15хв але refresh видасть з новим. Документ — `docs/MANAGER_APP_DEPLOY.md` §rotation |
| Resend SMTP down → password reset не доходить           | Low      | S70 EmailJob queue з retry уже зроблений; reset emails йдуть через ту саму чергу                                                                                                             |
| Sync worker memory leak за 24 год uptime                | Low      | PM2 `max_memory_restart: 500M` per S68 logrotate pattern                                                                                                                                     |

## 11. Supabase phase-out roadmap (parallel track, V2)

Manager app (M1) **не використовує Supabase** взагалі. Однак existing виробничий код тримає Supabase для двох речей, які треба замігрувати окремими сесіями (не блокують M1):

| Що                                                 | Файли                                                                                                                             | Сесія                                           | Стратегія                                                                                                                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Admin login**                                    | `apps/store/middleware.ts`, `apps/store/lib/supabase/*.ts`, `apps/store/app/admin/login/page.tsx`, `apps/store/lib/admin-auth.ts` | S88 (after M1.1)                                | Переключити admin SSR-middleware з `@supabase/ssr` на наш JWT cookie. Admin users переїздять у `users` таблицю (один SQL-export з Supabase Auth → bcrypt-hash → INSERT). Logout усіх Supabase-sessions, перший login через password-reset. |
| **Banner upload**                                  | `apps/store/app/admin/banners/actions.ts`, `lib/supabase/admin.ts`                                                                | S89                                             | Storage → `E:\ltex-storage\banners\`. Existing URL-и: backfill-script скопіює усі файли з Supabase Storage у локальний volume + UPDATE `banners.imageUrl` на нові `/files/banners/...` шляхи.                                              |
| **Product photo upload**                           | `apps/store/app/admin/products/actions.ts`                                                                                        | S90                                             | Те саме що S89 для `product_images.url`. Це 805 продуктів × ~5 фото = ~4000 файлів. Migration script + rollback план.                                                                                                                      |
| **Customer mobile (Expo) — Supabase Storage URLs** | `apps/mobile-client/src/screens/product/*`                                                                                        | S91                                             | Bumping image-URL prefix у mobile API responses — не потребує re-build app, бо URL приходить з API.                                                                                                                                        |
| **Decommission Supabase project**                  | —                                                                                                                                 | S92 (тільки коли S88-S91 done + 30 днів stable) | Експорт даних, шилання env vars, зняття `NEXT_PUBLIC_SUPABASE_*`.                                                                                                                                                                          |

Ця секція — **roadmap**, не M1-блокер. Manager app M1.1-M1.12 шипиться раніше і паралельно.

## 12. Definition of Done — v1.0

- [ ] Менеджер логіниться через email+password у браузері (власна auth, без Supabase)
- [ ] Може скинути пароль через email-link
- [ ] Бачить dashboard з сьогоднішніми orders + борги
- [ ] Може створити Order (повний life-cycle: pick client → pick items → submit)
- [ ] Order синхронізується з 1С протягом 2 хв (snapshot оновлюється)
- [ ] Може створити РТУ + Оплату на основі Order
- [ ] Може створити маршрут на день з прив'язкою orders
- [ ] Чат працює (groups + DM, SSE real-time)
- [ ] Push notifications приходять у Telegram (DM)
- [ ] Tauri-installer для Windows доступний у GitHub Releases
- [ ] macOS DMG self-signed доступний у GitHub Releases
- [ ] Документація:
  - `docs/MANAGER_APP_STRATEGY.md` (цей файл)
  - `docs/M1_BACKLOG.md`
  - `docs/SESSION_M1.{1..12}_*.md`
  - `docs/MANAGER_APP_DEPLOY.md` (post-M1.11)
- [ ] Tests:
  - Unit ≥40 (auth, manager-sync mock, validations)
  - E2E ≥5 (login, order create flow, route create)
  - 0 `any`, format/typecheck/build усі зелені
