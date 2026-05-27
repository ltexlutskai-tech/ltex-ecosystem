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

## Фази

- **Фаза 1 (inbound+reply, TG+Viber):** вебхуки → `ChatConversation`/`ChatInboxMessage`, звірка за номером → прив'язка до клієнта; UI inbox (список розмов + тред + SSE + unread); відповідь менеджера → бот шле клієнту. **Код+тести будуються без живих токенів** (платформенний send — за інтерфейсом, мок у тестах); жива конекція — коли будуть токени.
- **Фаза 2 (реєстрація нового):** номер не знайдено → бот питає область (+ім'я) → створюємо `MgrClient`(+`Customer`) → призначаємо торгового (за обраним правилом).
- **Фаза 3 (V2):** WhatsApp + Instagram (Meta).
- **TikTok:** лише кнопка-діплінк.

## Інваріанти

- 0 нових `any`, тести зелені, prettier/typecheck чисті. Платформенний send за інтерфейсом (mock-mode як у sync). Токени — у `.env` (НЕ в код/чат). Не ламати наявні бот-команди (/search /lots /order) — вільний текст іде в inbox, команди працюють.

## Кроки user (зовнішнє налаштування)

- Telegram: підтвердити @username наявного бота АБО новий через @BotFather → токен у `.env`.
- Viber: створити Bot Account на partners.viber.com → `VIBER_AUTH_TOKEN` у `.env`.
- Webhook-и налаштовує orchestrator/Claude після появи токенів.
