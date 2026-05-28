# План «Об'єднаний чат-inbox» (greenfield, M1.8)

Зведення дослідження (наявні Telegram/Viber-вебхуки + чат `ChatMessage`/SSE +
звірка за номером + 1С-логіка агента). Рішення user: старт **Telegram+Viber**,
обидва напрямки, авто-прив'язка за номером, новий клієнт → область → торговий,
**звіряємо номери з базою** (старе 1С не чіпаємо).

## ⚠️ Жорсткі обмеження платформ

- Inbox можливий **лише через БОТИ** (клієнт пише боту L-TEX, не особистому акаунту менеджера).
- **TikTok** — **немає API для DM** → поза inbox (максимум кнопка-діплінк).
- **WhatsApp/Instagram** — лише через Meta (Business акаунт/номер/app review) → пізніша фаза.

## Наявні активи (реюз)

- `apps/store/app/api/telegram/webhook/route.ts` — безпечний (webhook secret), `sendMessage(chatId,text)` є; зараз command-based.
- `apps/store/app/api/viber/webhook/route.ts` — безпечний (HMAC), обробляє subscribed/message; `sender.id`+`message.text`.
- `ChatMessage`+SSE (`/api/mobile/chat/stream`, polling 3с) + `/api/admin/chat/reply` + unread-badge — патерн для UI.
- `@ltex/shared` `normalizePhone` (E.164) + `MgrClientPhone[]`/`phonePrimary`/`Customer.phone`.
- `User.telegramChatId`/`notifyChannels`, `MgrClient.agentUserId`, `ClientAssignment`, M1.3f ownership.

## Модель даних (нова, окремо від внутрішнього `ChatMessage`)

- **`ChatConversation`**: `id, platform (telegram|viber|whatsapp|instagram), externalUserId, externalUserName?, phone?, clientId? (MgrClient, nullable до матчу/реєстрації), agentUserId? (відповідальний менеджер), status (active|archived), lastMessageAt, createdAt` + `@@unique([platform, externalUserId])`.
- **`ChatInboxMessage`**: `id, conversationId, direction (in|out), sender (client|manager|system), text, mediaUrl?, externalMessageId?, authorUserId? (хто з менеджерів відповів), isRead, createdAt`.
- (Manager platform identity НЕ потрібен — відповіді шле бот клієнту за `externalUserId`.)
- Видимість: розмова з прив'язаним клієнтом → видно агенту клієнта + admin (як ownership). Непов'язані (нові) → спільний «Невпізнані» inbox до реєстрації.

## Авто-прив'язка за номером

Вхідне повідомлення → дістати телефон (Telegram: contact-share / Viber: `get_user_details`) → `normalizePhone` → матч `MgrClientPhone`→`phonePrimary`→`Customer.phone`. Знайдено → `conversation.clientId` + agent. Не знайдено → реєстрація (Фаза 2).

## ❓ Головне відкрите питання — правило «торговий для нового клієнта»

У 1С явного «область→агент» нема. Варіанти для веба:

- **A.** Мапа **область→торговий** (адмін налаштовує) → новий клієнт за областю іде відповідному агенту. _(потрібна нова таблиця-мапа)_
- **B.** Агент = менеджер, який обробив/зареєстрував чат (найпростіше).
- **C.** Інше (round-robin / по маршруту / комбінація).

### ✅ РІШЕННЯ USER: варіант A — за областю (мапа)

Нова таблиця-мапа **`MgrRegionAgent`** (`region → agentUserId`, адмін-налаштовувана, + мінімальний admin-UI). Новий клієнт із бота: бот питає область → шукаємо агента за областю в мапі → призначаємо. Якщо для області агента нема — лишаємо в «Невпізнані»/на admin (fallback уточнити при побудові Фази 2).

## Фази

- **Фаза 1 (inbound+reply, TG+Viber):** ✅ DONE. Вебхуки → `ChatConversation`/`ChatInboxMessage`, звірка за номером → прив'язка до клієнта; UI inbox (список розмов + тред + SSE + unread); відповідь менеджера → бот шле клієнту.
- **Фаза 2 (реєстрація нового):** ✅ DONE. Бот сам веде діалог:
  1. Нова розмова → welcome + кнопка contact-share (Telegram `request_contact` / Viber `share-phone`).
  2. Phone отриманий → `matchClientByPhone`. Знайдено → link + welcome-back з ім'ям менеджера.
  3. Не знайдено → бот шле 24-кнопкову клавіатуру областей (Telegram inline 2-в-ряд / Viber reply 2-в-ряд через `Columns:3`). Phone тимчасово зберігається у `ChatConversation.pendingPhone`.
  4. Користувач обрав область → шукаємо у мапі `MgrRegionAgent`. Знайдено → створюємо `MgrClient` з `agentUserId` + completed; не знайдено → unassigned (admin розрулить вручну через `/manager/admin/region-agents`).
  - **State machine** у `apps/store/lib/chat/registration.ts` (enum `chat_registration_step`: awaiting_phone / awaiting_region / completed / unassigned).
  - **Список областей:** 24 (без окремого м. Київ — Київська область включає Київ). Slug→label мапа у `apps/store/lib/constants/regions.ts`.
  - **Phone input** ТІЛЬКИ через contact-share кнопку (без ручного вводу); якщо клієнт пише вільний текст замість тапу — бот нагадує про кнопку.
  - **Admin UI:** `/manager/admin/region-agents` (тільки admin) для CRUD мапи.
- **Фаза 3 (V2):** WhatsApp + Instagram (Meta).
- **TikTok:** лише кнопка-діплінк.

## Інваріанти

- 0 нових `any`, тести зелені, prettier/typecheck чисті. Платформенний send за інтерфейсом (mock-mode як у sync). Токени — у `.env` (НЕ в код/чат). Не ламати наявні бот-команди (/search /lots /order) — вільний текст іде в inbox, команди працюють.

## Кроки user (зовнішнє налаштування)

- Telegram: підтвердити @username наявного бота АБО новий через @BotFather → токен у `.env`.
- Viber: створити Bot Account на partners.viber.com → `VIBER_AUTH_TOKEN` у `.env`.
- Webhook-и налаштовує orchestrator/Claude після появи токенів.
