# Manager Workstation — Strategy

**Status:** Draft v1 (2026-05-12). Owner: orchestrator session.
**Replaces:** 1C `MobileAgentLTEX` v1.15.3 (Android-only, SOAP-bound).
**Companion docs:** [`MOBILE_APP_ANALYSIS.md`](../MOBILE_APP_ANALYSIS.md) — повний аудит 1С-конфігурацій; [`M1_BACKLOG.md`](M1_BACKLOG.md) — посесійний backlog з acceptance criteria.

---

## 1. Vision

Робоче місце менеджера L-TEX, що замінює 1С Mobile Platform-додаток. Покриває: клієнти, товари, замовлення, реалізація+оплата, каса, маршрути, презентації, чат, нагадування, кілометраж, гео-логування, курси валют, ШК-сканування. Працює як **веб-додаток у браузері** (фаза 1), пізніше пакується у **Tauri-installer для Windows + macOS** (фаза 2) з нативними нотифікаціями + system-tray + auto-update. Notifications дублюються у **Telegram bot per-manager DM** як failover і як basic-канал коли застосунок закритий.

## 2. Архітектурні рішення

| # | Питання | Рішення | Підстава |
|---|---|---|---|
| 1 | Shell | **Web-first → Tauri wrap (M1.11)** | Зменшити initial risk; web-функціонал стабілізується, потім нативний інсталер. |
| 2 | 1С integration | **Hybrid: read snapshot, write SOAP-proxy** | `MOBILE_APP_ANALYSIS.md §8.7`. Швидкий UI читає з локального Postgres-snapshot; write-операції одразу проксі у `MobileExchange.1cws` з idempotency-key. Background `services/manager-sync/` оновлює snapshot. |
| 3 | Auth | **Email+password + HMAC JWT** (`/api/v1/manager/auth/*`) | Той самий pattern, що `/api/mobile/*` customer auth — `MOBILE_JWT_SECRET` уже у проді. Reset через Supabase magic-link. |
| 4 | Notifications | **Tauri native push + Telegram DM** паралельно | Workstation відкритий → OS push; закритий → Telegram DM на телефон менеджера. Telegram bot уже існує (`services/telegram-bot`). |

## 3. Tech stack

| Шар | Технологія | Примітка |
|---|---|---|
| Frontend | Next.js 15 App Router + React 19 + Tailwind + shadcn/ui | Сегмент `apps/store/app/manager/*` усередині існуючого monorepo |
| Auth | `/api/v1/manager/auth/login` → HMAC JWT (15 хв access + 30 днів refresh) | Reuse `lib/mobile-auth.ts` pattern |
| State (server) | TanStack Query | Cache invalidation через SSE events |
| Real-time | Server-Sent Events через `/api/v1/manager/stream` | Resume via `Last-Event-ID` header |
| DB | Той самий PostgreSQL 16 (local Windows Server) + Prisma | Нові таблиці з префіксом `mgr_` |
| Sync worker | Новий `services/manager-sync/` (Node, окрема PM2 instance) | Polls `MobileExchange.1cws` кожні 60c, пише дельти у `mgr_*` snapshot tables |
| Notifications | Telegram bot DM + Tauri OS push | `services/telegram-bot` розширюється `/start_manager` + DM-send функцією |
| Desktop wrap | Tauri 2 (M1.11) | Rust shell ~10 МБ; auto-update через GitHub Releases |
| Build | EAS не потрібен (Tauri має власний `tauri build`); CI matrix windows-latest + macos-latest у M1.11 | macOS code-signing — окрема історія (можна self-signed DMG для internal distribution) |

## 4. Identity модель

### 4.1. DB additions

```prisma
model Manager {
  id              String   @id @default(cuid())
  supabaseUserId  String   @unique
  email           String   @unique
  fullName        String
  role            ManagerRole @default(manager)
  isActive        Boolean  @default(true)

  // 1C-bridge
  code1C          String?  @unique     // ТорговыеАгенты.Код
  warehouseId1C   String?              // склад менеджера у ЦБ

  // Telegram bot bridge
  telegramChatId  String?  @unique     // null until /start_manager linked
  telegramLinkToken String? @unique    // one-time token for QR/copy-paste pairing
  notifyChannels  String[] @default(["push","telegram"])  // ["push","telegram","none"]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  lastSeenAt      DateTime?

  // relations
  refreshTokens   ManagerRefreshToken[]
  assignedClients ClientAssignment[]
}

enum ManagerRole {
  manager
  senior_manager
  admin
}

model ManagerRefreshToken {
  id          String   @id @default(cuid())
  managerId   String
  tokenHash   String   @unique
  expiresAt   DateTime
  revokedAt   DateTime?
  userAgent   String?
  ipAddress   String?
  createdAt   DateTime @default(now())
  manager     Manager  @relation(fields: [managerId], references: [id], onDelete: Cascade)
}

model ClientAssignment {
  id          String   @id @default(cuid())
  managerId   String
  customerId  String                    // FK to existing customers table
  assignedAt  DateTime @default(now())
  manager     Manager  @relation(fields: [managerId], references: [id], onDelete: Cascade)
  @@unique([managerId, customerId])
}
```

### 4.2. Auth flow

```
POST /api/v1/manager/auth/login
  Body: { email, password }
  → Supabase Auth Admin SDK validate
  → upsert Manager record (auto-create на перший login якщо є whitelist у env або Manager row уже існує)
  → return { accessToken (15min HMAC JWT), refreshToken (30d), manager: { id, fullName, role, telegramLinked } }

POST /api/v1/manager/auth/refresh   Body: { refreshToken }
POST /api/v1/manager/auth/logout    Body: { refreshToken }
GET  /api/v1/manager/auth/me        Authorization: Bearer <accessToken>
```

JWT payload: `{ sub: managerId, role, exp, iat }`. Verify через існуючий `lib/mobile-auth.ts::verifyJwt()` (extended with manager-namespace claim).

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

| Event | Source | Default channels |
|---|---|---|
| `order.new` (хтось створив order де ти responsible) | sync-worker detects new ЗаказПокупателя.Ответственный = me | push + telegram |
| `chat.message` (хтось пише у chat-group де ти учасник) | new row у `mgr_chat_messages` | push + telegram |
| `reminder.fire` (запланована подія) | cron на `mgr_reminders.firesAt ≤ now` | push + telegram |
| `client.debt_overdue` (клієнт пройшов поріг боргу) | sync-worker on `Контрагенты.ПросроченныйДолг` change | telegram |
| `lot.reserved_by_other` (хтось забронював лот за яким ти стежиш) | sync-worker on `Резервы` change | push + telegram |
| `route.assigned` (старший менеджер призначив тобі маршрут) | sync-worker on `МаршрутныйЛист.Ответственный` | push + telegram |

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

| Phase | Сесії | Залежності | Ціль |
|---|---|---|---|
| **0** | M1.0 | — | Strategy + backlog (ця сесія) |
| **1 — Foundation** | M1.1, M1.2 | M1.0 | Manager DB, auth, workstation shell |
| **2 — Read paths** | M1.3, M1.4 | M1.2 | Clients view, products + ШК |
| **3 — Write paths** | M1.5, M1.6 | M1.4 | Orders, sales+payments |
| **4 — Operations** | M1.7, M1.8, M1.9 | M1.5 | Routes, chat, reminders+geo |
| **5 — Notifications + Desktop** | M1.10, M1.11 | M1.8 | Telegram bot extension, Tauri wrap |
| **6 — Resilience** | M1.12 | M1.5 | Offline queue + retry |
| **V2** | M2.x | — | Returns, presentations-to-Viber, reports, batch reservations |

## 8. Working agreement

### 8.1. Хто що робить

| Роль | Хто | Що |
|---|---|---|
| Product owner | User | Дає скрін поточного 1С-екрану, описує "що змінити / залишити / додати" |
| Orchestrator | Цей сесійний Claude | Аналізує скріни + аудит звіту → пише worker-spec у `docs/SESSION_M1.N_*.md` → merge у main |
| Worker | Окрема Claude session | Виконує spec у `claude/manager-mN-*` branch → пушить → НЕ мерджить |

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

- **iOS native** — Tauri тільки для Win+macOS. Для iOS — окрема пожиланка пізніше.
- **Друк чеків** — Bluetooth-принтери не у v1. Менеджер друкує через Web Bluetooth API стороннього додатку (V2).
- **Bric-a-Brac live-photo** — те, що для customer mobile-client, тут не actual.
- **Видавання знижок** — лишається у 1С Director-role; manager-app дисплейс % але не може override (V2).
- **Бронювання партій** — V2 (потребує live race-detection у `mgr_lots`).
- **Звіти у форматі 1С-СКД** — V2; в v1 simplified dashboard.
- **Виборка з режиму "ВечірнійОбмін"** — гнучкий sync-worker robust enough.
- **Конкуренти-ціни** (поле `ІншіПостачальники` у Заказ) — V2.

## 10. Risks + mitigations

| Ризик | Severity | Mitigation |
|---|---|---|
| 1С SOAP падає, sync worker не може писати | High | Outbox-pattern: `mgr_orders_outbox(status)` retries з exp backoff (1м/5м/30м/2г/6г), як S70 EmailJob |
| MobileExchange.1cws хардкоджений пароль викрадено | Medium | Не expose у фронт; зберігати у `apps/store/.env` як `MOBILE_EXCHANGE_SOAP_PASSWORD`; rotate раз на 90 днів |
| Race: 2 менеджери намагаються забронювати той самий лот | Medium | Pessimistic lock у `mgr_lots.reservedByManagerId` + SOAP write protected by 1С transaction |
| Tauri auto-update ламає running session | Low | `tauri-plugin-updater` показує UI prompt, never silent restart |
| Telegram bot rate-limit (FloodWait) | Low | Existing `services/telegram-bot` уже має retry; per-manager DM ≤ 30 msgs/sec ліміт безпечно |
| Manager забув email — не може скинути пароль | Low | Supabase magic-link → admin web UI (admin role може reset чужий password) |
| Sync worker memory leak за 24 год uptime | Low | PM2 `max_memory_restart: 500M` per S68 logrotate pattern |

## 11. Definition of Done — v1.0

- [ ] Менеджер логіниться через email+password у браузері
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
