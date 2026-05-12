# Manager Workstation — M1 Backlog

**Source of truth для phased rollout.** Кожен entry → один worker session. Acceptance criteria тут — high-level; detailed spec пишеться у `docs/SESSION_M1.N_*.md` коли сесія готується (після того як user пришле скріни поточного 1С-екрану).

> Контекст і архітектура: `docs/MANAGER_APP_STRATEGY.md`. Аудит 1С: `MOBILE_APP_ANALYSIS.md`.

---

## Dependency graph

```
M1.0 (strategy)  ✓ done
   └─→ M1.1 (auth + DB) ────────────────┐
         └─→ M1.2 (shell)               │
               ├─→ M1.3 (clients)       │
               │    └─→ M1.6 (sales)    │
               │         └─→ M1.7 (routes)
               │              └─→ M1.10 (telegram bot)
               │                   └─→ M1.11 (Tauri wrap)
               ├─→ M1.4 (products + ШК) │
               │    └─→ M1.5 (orders) ──┤
               │         └─→ M1.12 (offline queue)
               ├─→ M1.8 (chat) ─────────┘
               └─→ M1.9 (reminders + geo)

V2: M2.1 returns, M2.2 presentations+viber, M2.3 reports, M2.4 reservations
```

## Sessions

### M1.0 — Strategy + backlog ✓
**Status:** done (this session).
**Artefacts:** `docs/MANAGER_APP_STRATEGY.md`, `docs/M1_BACKLOG.md`.

---

### M1.1 — Manager DB schema + auth endpoints
**Goal:** Створити Prisma модель `Manager` + auth API + login screen.
**Pre-reqs:** Скрін поточного 1С `ФормаВводаПароля` (`MOBILE_APP_ANALYSIS.md §5.4.5`).
**Acceptance:**
- [ ] Migration `2026MMDD_manager_auth`: `Manager`, `ManagerRefreshToken`, `ClientAssignment`, enum `ManagerRole`
- [ ] `POST /api/v1/manager/auth/login` (Zod, rate-limit 5/min/IP, Supabase Admin SDK validate, return JWT pair)
- [ ] `POST /api/v1/manager/auth/refresh` (rotate refresh token)
- [ ] `POST /api/v1/manager/auth/logout` (revoke refresh)
- [ ] `GET /api/v1/manager/auth/me` (return Manager + role)
- [ ] `lib/manager-auth.ts` middleware helper (verify Bearer JWT, attach `req.manager`)
- [ ] Login screen `/manager/login` (mirror admin UI but на manager-namespace)
- [ ] Middleware: `/manager/:path*` → redirect to `/manager/login` коли немає valid JWT
- [ ] Unit tests ≥ 8 (auth happy + invalid + expired + rate-limited + manager-disabled)
- [ ] `.env.example` доповнено: `MOBILE_EXCHANGE_SOAP_URL`, `MOBILE_EXCHANGE_SOAP_USER`, `MOBILE_EXCHANGE_SOAP_PASSWORD` (поки stub)
**Out of scope:** UI inside `/manager/*` крім login (М1.2 робить shell).

---

### M1.2 — Workstation shell + dashboard skeleton
**Goal:** Layout `/manager/*` із sidebar, header (manager name + logout + connection-status), і Dashboard з 4 заглушками (Сьогодні / Замовлення / Чат / Маршрут).
**Pre-reqs:** Скрін поточного `Catalog.РабочийСтол.ФормаСписка` (`§5.1.2` головний екран 1С). User вкаже які 4-6 плиток найважливіші.
**Acceptance:**
- [ ] `apps/store/app/manager/layout.tsx` — двоколонковий desktop layout, mobile fallback Sheet
- [ ] Sidebar nav: Dashboard, Клієнти, Товари, Замовлення, Реалізації, Каса, Маршрути, Чат, Нагадування, Налаштування
- [ ] Header: manager fullName, connection indicator (online/syncing/offline), notification bell (count), logout
- [ ] Dashboard `/manager` — 4 plate cards з real data (count from DB) + auto-refresh 30s
- [ ] Layout adapts: <1024px → sidebar в Sheet, ≥1024px → fixed
- [ ] `lib/manager-context.tsx` — React context з current manager, connection state, notification count

---

### M1.3 — Clients (read-only) + детальна картка
**Goal:** List+search+detail клієнтів з snapshot.
**Pre-reqs:** Скріни `Catalog.Контрагенты.ФормаСписка` + `ФормаЭлемента` (борг, склади, асортимент, історія).
**Acceptance:**
- [ ] Migration `2026MMDD_mgr_clients_snapshot`: `mgr_clients`, `mgr_client_warehouses`, `mgr_client_assortment`, `mgr_client_timeline` (read-only mirror)
- [ ] `services/manager-sync/__mocks__/clients-fixture.json` — 50 mock clients для dev (доки немає live SOAP)
- [ ] `services/manager-sync/src/sync-clients.ts` — pure function-pulls дельт + writes snapshot
- [ ] `GET /api/v1/manager/clients?search=&onlyMine=&page=&size=` (returns Client[] із snapshot)
- [ ] `GET /api/v1/manager/clients/{id}` (повна картка + warehouses + assortment + timeline)
- [ ] `GET /api/v1/manager/clients/{id}/timeline` (paginated)
- [ ] `/manager/clients` — список з search, debt-індикатор, "Тільки мої" toggle
- [ ] `/manager/clients/[id]` — табована (Реквізити / Склади / Асортимент / Історія / Борг)
- [ ] Optimistic UI: при click on row → instant detail render з snapshot data

---

### M1.4 — Products + lots + ШК-сканер
**Goal:** Список товарів, картка з характеристиками, пошук по name/article/barcode.
**Pre-reqs:** Скріни `ФормаПодбораНоменклатуры` (`§5.4.2`) + `ХарактеристикиНоменклатуры.ФормаЭлемента` (`§5.11`).
**Acceptance:**
- [ ] Migration `2026MMDD_mgr_products_snapshot`: `mgr_products`, `mgr_lots`, `mgr_prices`, `mgr_balances`, `mgr_barcodes`
- [ ] `services/manager-sync/src/sync-products.ts` (similar pattern як sync-clients)
- [ ] `GET /api/v1/manager/products?search=&category=&barcode=&priceTypeId=`
- [ ] `GET /api/v1/manager/products/{id}` (з lots[] + currentPrice по priceType + балансом)
- [ ] `GET /api/v1/manager/products/by-barcode/{barcode}` (single product + lot resolve)
- [ ] `/manager/products` — list + autocomplete search + filter sidebar
- [ ] `/manager/products/[id]` — фото-галерея (із Supabase Storage), список лотів, ціни табком
- [ ] ШК-сканер handler: глобальний `keydown`-listener detect-ить sequence > 4 символи + Enter < 50мс → запит `by-barcode` → focus на знайдений товар
- [ ] PWA permission: camera для майбутнього QR-scan-у через `getUserMedia` (V2)

---

### M1.5 — Order create + submit
**Goal:** Document `Заказ` створення (full life-cycle: draft → submit → 1С-sync).
**Pre-reqs:** Скрін `Document.Заказ.ФормаДокумента` + `§5.6 Workflow #1`.
**Acceptance:**
- [ ] Migration `2026MMDD_mgr_orders_outbox`: `mgr_orders`, `mgr_order_items`, `mgr_orders_outbox` (status pending/syncing/synced/failed)
- [ ] Zod schema `mgrOrderCreateSchema` (clientId, items[], priceTypeId, comment, deliveryStatus, paymentStatus, cashOnDelivery, locationLat/Lng, otherSuppliers[])
- [ ] `POST /api/v1/manager/orders` (idempotency-key header required, returns `{id, status: "pending"}`)
- [ ] `PATCH /api/v1/manager/orders/{id}` (update draft, validate ownership)
- [ ] `POST /api/v1/manager/orders/{id}/submit` (status pending → syncing → triggers SOAP)
- [ ] `GET /api/v1/manager/orders?clientId=&dateFrom=&dateTo=&status=`
- [ ] `services/manager-sync/src/process-outbox.ts` — pulls pending orders, calls `ОбработатьПакетДанных`, updates status
- [ ] `/manager/orders` (list, filter, pagination)
- [ ] `/manager/orders/new` (form: pick client → pick items via `<ProductPickerSheet>` → quantity → submit)
- [ ] `/manager/orders/[id]` (detail view, re-edit while pending, re-submit on failed)
- [ ] Min order: 10 кг validation (як customer flow)
- [ ] Edge case: 1C відповів "товару нема" → outbox status=failed → UI toast + retry button

---

### M1.6 — Sales (РТУ) + payments
**Goal:** Реалізація на базі Order + DataProcessor.Оплата + КассовыйОрдер.
**Pre-reqs:** Скріни `Document.РеализацияТоваровУслуг`, `DataProcessor.Оплата` (`§5.5.1`), `Document.КассовыйОрдер`.
**Acceptance:**
- [ ] Migration `2026MMDD_mgr_sales_cash`: `mgr_sales`, `mgr_sale_items`, `mgr_cash_orders`
- [ ] `POST /api/v1/manager/sales` (з optional orderId, items[], paymentStatus, courseEUR/USD)
- [ ] `POST /api/v1/manager/sales/{id}/post` (проведення = SOAP)
- [ ] `POST /api/v1/manager/cash-orders` (приход з полями amountUAH/EUR/USD + bankAccount + cashFlowArticle)
- [ ] UI `/manager/sales/new?orderId=X` — копія order-items, можна змінити qty/price/discount
- [ ] Payment modal: 3 currency inputs + auto-розрахунок здачі (формула з §5.5.1)
- [ ] Якщо здача > 0 → автоматично створюється другий КассовыйОрдер (Расход) з `changeForId` посиланням
- [ ] Discount validation: % максимум з `manager.role` config (manager=5%, senior=15%, admin=∞)

---

### M1.7 — Routes (маршрутні листи) + кілометраж
**Goal:** Document `МаршрутныйЛист` з orders-binding + start/end mileage.
**Pre-reqs:** Скріни `Document.МаршрутныйЛист`, `ФормаВводаКілометражу` (`§5.4.4`), `§5.9 Workflow #4`.
**Acceptance:**
- [ ] Migration `2026MMDD_mgr_routes`: `mgr_routes`, `mgr_route_orders`, `mgr_mileage_log`
- [ ] `POST /api/v1/manager/routes` (date, orderIds[])
- [ ] `PATCH /api/v1/manager/routes/{id}/start` (записує mileage_start + GPS lat/lng)
- [ ] `PATCH /api/v1/manager/routes/{id}/end` (mileage_end + GPS)
- [ ] `GET /api/v1/manager/routes?date=YYYY-MM-DD`
- [ ] `/manager/routes/today` — drag-to-reorder order-list (для optimal путі)
- [ ] Mandatory mileage prompt — coли манагер відкриває app перший раз на день, modal "Введіть стартовий кілометраж" блокує navigation поки не введено
- [ ] Modal "Завершити день" — наприкінці натискає, вводить end mileage → SOAP submit

---

### M1.8 — Internal chat (groups + DM)
**Goal:** Менеджер-менеджер чат через SSE.
**Pre-reqs:** Скрін `DataProcessor.Чат1с` (`§5.5.2`).
**Acceptance:**
- [ ] Migration `2026MMDD_mgr_chat`: `mgr_chat_groups`, `mgr_chat_group_members`, `mgr_chat_messages`, `mgr_chat_read_state`
- [ ] `GET /api/v1/manager/chat/groups` (list + unread per group)
- [ ] `GET /api/v1/manager/chat/groups/{id}/messages?since=&limit=`
- [ ] `POST /api/v1/manager/chat/groups/{id}/messages` (text, optional attachmentUrl до Supabase Storage)
- [ ] `POST /api/v1/manager/chat/groups/{id}/read` (mark up-to messageId)
- [ ] `GET /api/v1/manager/stream` (SSE, відсилає `chat.message` events)
- [ ] `/manager/chat` (list groups, click → enter)
- [ ] `/manager/chat/[groupId]` (thread, infinite scroll up, send composer, file-drop)
- [ ] Optimistic send (показує перед server-ack), retry on fail
- [ ] @mention support — autocomplete з членів групи

---

### M1.9 — Reminders + geo logging
**Goal:** Заплановані нагадування + фон GPS track.
**Pre-reqs:** Скріни `DataProcessor.Нагадування` (`§5.5.3`), `Геопозиціювання` (`§5.13`).
**Acceptance:**
- [ ] Migration `2026MMDD_mgr_reminders_geo`: `mgr_reminders`, `mgr_geo_log`
- [ ] `POST /api/v1/manager/reminders` (text, scheduledAt, recurrence, productId?, clientId?)
- [ ] `PATCH /api/v1/manager/reminders/{id}` + `POST /done`
- [ ] `GET /api/v1/manager/reminders?status=upcoming|done`
- [ ] Cron `/api/cron/fire-reminders` (запускається кожні 60с, emit `reminder.fire` event → telegram + push)
- [ ] `POST /api/v1/manager/geo/track` (batch upload [{ts, lat, lng}])
- [ ] `/manager/reminders` (form + list з recurrence)
- [ ] GeoTrackProvider у layout — браузер `navigator.geolocation.watchPosition` (тільки коли user opt-in у settings). Tauri (M1.11) використовує rust plugin для background-only

---

### M1.10 — Telegram bot extension (per-manager DM + commands)
**Goal:** Розширити `services/telegram-bot` щоб надсилати DM конкретним менеджерам + accept commands.
**Pre-reqs:** Поточний bot вже шле у спільний `TELEGRAM_CHAT_ID`. Цей session переключає його на per-manager DM при наявності `Manager.telegramChatId`.
**Acceptance:**
- [ ] Handler `/start_manager <token>` — exchange one-time token (із `Manager.telegramLinkToken`) на `chat_id` binding
- [ ] Handler `/today` — list orders responsible_manager=me, today's
- [ ] Handler `/debt <code>` — current debt for client
- [ ] Handler `/help` — list commands
- [ ] `lib/notifications.ts::sendToManager(managerId, payload)` — DM-aware send (priority order: telegram if linked, then group fallback)
- [ ] Inline-кнопки під push: `[Відкрити]` (deep-link до `/manager/...`), `[Прийняти]` (POST до server), `[Відхилити]`
- [ ] UI `/manager/settings` — section "Telegram" з QR-кодом + token reveal + status (linked/not)
- [ ] Telegram webhook secret rotated; existing setup НЕ ламається (поточні `notifyNewOrder` усе ще йдуть у group AND per-responsible-manager DM)

---

### M1.11 — Tauri 2 wrap для Windows + macOS
**Goal:** Native installer що hosts our `/manager` web-app.
**Pre-reqs:** M1.10 done (notification stack stable).
**Acceptance:**
- [ ] `apps/manager-desktop/` Tauri project (Rust ≥1.77, Tauri 2.x)
- [ ] `tauri.conf.json` пакує static export `/manager/*` АБО embed-ить production URL через `tauri-plugin-shell`
- [ ] Native menubar (File / Edit / View / Help, з shortcut keys)
- [ ] System tray icon з context menu (Open / New Order / Quit)
- [ ] Deep-link `ltex-manager://order/{id}` via `tauri-plugin-deep-link`
- [ ] Auto-updater через GitHub Releases (signed)
- [ ] Native notifications через `tauri-plugin-notification` (replaces browser Notification API)
- [ ] CI matrix у `.github/workflows/manager-desktop.yml`: windows-latest + macos-latest builds, attach artefacts до Release on tag push
- [ ] macOS — self-signed DMG (note у `docs/MANAGER_APP_DEPLOY.md` про "Right-click → Open" перший раз)
- [ ] Windows — MSI installer, не вимагає admin (per-user install)
- [ ] App icon (256×256 PNG для Win, 1024×1024 для macOS, з `apps/manager-desktop/icons/`)
- [ ] `docs/MANAGER_APP_DEPLOY.md` — інструкція як збудувати/підписати/публікувати release

---

### M1.12 — Offline mutation queue
**Goal:** Якщо connectivity drops, мутації стають у чергу у IndexedDB і re-tryяться при відновленні.
**Pre-reqs:** M1.5 (orders write-path).
**Acceptance:**
- [ ] `lib/offline-queue.ts` — IndexedDB store (idb wrapper), schema `{id, method, url, body, headers, attempts, createdAt, lastError}`
- [ ] TanStack Query global `mutationFn` wrapper — на network-error → enqueue, на success → drain
- [ ] `<OfflineQueueIndicator>` у header (badge з count + click → drawer з list/retry-all/discard)
- [ ] Worker drain: AbortController, exponential backoff (per attempt 1s/5s/30s/120s/600s), max 5 attempts → status=permanently_failed → user notification
- [ ] LocalStorage flag `mgr.offlineMode` (manual toggle для дебагу)
- [ ] Tests: drain happy + 5xx retry + 4xx permanent fail + queue persists across page reload

---

### V2 (M2.x) — Out-of-scope для v1 launch

| Session | Topic | Notes |
|---|---|---|
| M2.1 | Returns flow | `Возврат` + `ВозвратОтПокупателя` per §5.8 |
| M2.2 | Presentations + Viber share | Шарінг товару у Viber per §5.10 + bot integration |
| M2.3 | Reports (СКД-like) | Звіт продажів + наявності per §5.4.8 |
| M2.4 | Reservation race-detection | Pessimistic lock на `mgr_lots` + UI conflict resolution |
| M2.5 | iOS Tauri (if Apple Developer обзаведений) | Окрема target у CI matrix |
| M2.6 | Bluetooth check-printer | Web Bluetooth API → ESC/POS protocol |
| M2.7 | Multi-org support | Якщо L-TEX розширюється на додаткові регіони/компанії |

---

## Tracking convention

Кожна merged session → один section у `docs/HISTORY.md` (за template існуючих S-секцій), починаючи з `S87` нумерації (де M1.0 = S87, M1.1 = S88 і т.д.). Це уніфікує count з рештою проекту.

## Open questions для user (зібрати перед M1.1)

1. Чи всі менеджери уже мають Supabase Auth account (admin/login користувались) — чи доведеться створити нових?
2. Звідки брати `Manager.code1C` (mapping до 1С `Catalog.ТорговыеАгенты.Код`)? Manual seed чи sync з 1С?
3. Чи Wi-Fi у офісі і LTE на телефоні менеджера — це той самий network (тобто `192.168.0.10` LAN доступний звідки) чи завжди через VPN до `ltex1c.com.ua`?
4. Чи зараз менеджери реально використовують Telegram-канал нотифікацій (`TELEGRAM_CHAT_ID`)? Якщо так — поточний канал ламати не можна, треба добавляти DM поверх.
5. Чи `ПарольВхода` (поточний 1С) = email-у Supabase? Якщо так — можемо при first-login auto-mapping. Якщо ні — manual admin invite потрібен.
