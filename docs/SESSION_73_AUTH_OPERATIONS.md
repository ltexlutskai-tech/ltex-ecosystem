# Session 73 — Customer auth + price gate operations

S73 додає фронтовий вхід для покупців (телефон + імʼя без OTP) та приховує ціни від гостей. Цей документ описує операційні дії для розгортання в продакшн.

## Що змінилось

- Новий cookie `ltex_customer` (HMAC-підписаний, 30 днів TTL).
- Нова сторінка `/login`, новий розділ `/account` (профіль + замовлення).
- Гості не бачать цін на `/`, `/catalog`, `/lots`, `/product/[slug]`, `/lot/[barcode]`, `/sale`, `/new`, `/top`. Замість цін — CTA «Увійдіть щоб побачити ціну».
- Mobile API (`/api/mobile/*`) та `/api/cart` працюють як і раніше — mobile має окремий JWT.
- Cart merge: якщо у гостя є кошик за `sessionId`, при логіні він прикріплюється до клієнта (або зливається з його існуючим кошиком).
- Wishlist sync: локальний список «обраного» автоматично зливається з `Favorite` (DB) при логіні.

## Налаштування `.env`

Згенерити секрет (>= 32 символи) на сервері:

```powershell
# Windows PowerShell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
($bytes | ForEach-Object { $_.ToString("x2") }) -join ''
```

або, якщо є openssl:

```bash
openssl rand -hex 32
```

Додати у `apps/store/.env`:

```
CUSTOMER_AUTH_SECRET="<згенерований hex рядок>"
```

Скопіювати у standalone (як завжди для деплоя):

```powershell
Copy-Item apps\store\.env apps\store\.next\standalone\apps\store\.env -Force
```

`instrumentation.ts` валідує наявність ключа у production — без нього сервер впаде на boot з повідомленням `CUSTOMER_AUTH_SECRET must be at least 32 characters`. Це навмисне fail-fast, як зроблено для `MOBILE_JWT_SECRET` / `SYNC_API_KEY` (S64).

## Деплой

```powershell
# після pull + .env update:
.\scripts\deploy.ps1
```

Перевірка після деплоя:

1. Відкрити https://new.ltex.com.ua у приватному вікні браузера → у хедері має зʼявитися кнопка «Увійти».
2. Перейти на `/catalog` → ціни показуються як CTA «Увійдіть щоб побачити ціну».
3. Виконати login через форму на `/login`:
   - Тестовий phone: `+380671234567`
   - Тестове імʼя: `Тест`
4. Після успішного login → редірект на `/account`. У хедері — імʼя + меню.
5. На `/catalog` ціни тепер показуються як EUR/UAH (як раніше).
6. Logout через меню → cookie очищається, ціни знову приховані.

## Швидка перевірка через cURL

```bash
# Login (на dev / preview)
curl -i -X POST https://new.ltex.com.ua/api/auth/customer/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+380671234567","name":"Test"}'

# Очікуваний результат: HTTP 200, заголовок Set-Cookie: ltex_customer=...
```

## Rollback

Просто revert комітів S73 і повторний deploy. Cookie `ltex_customer` стане орфаном — застосунок буде ігнорувати без CUSTOMER_AUTH_SECRET (verify повертає null), тому жодних додаткових дій не потрібно.

## Поведінка під час відсутності `CUSTOMER_AUTH_SECRET`

- В **production** — boot-fail (`instrumentation.ts` кидає Error).
- В **dev** — попередження не лог-ається; `signCustomerToken` повертає `null` → `setCustomerCookie` кидає, `/api/auth/customer/login` віддасть 500.

## Не покрито у S73 (follow-up задачі)

- OTP / SMS-верифікація номера (S74?).
- Sync лотів у DB-обране (зараз lot-favorites лишаються тільки у localStorage).
- Адмін-панель для перегляду активних customer cookie.
- Email/Telegram нотифікація при першому логіні нового клієнта.

## Перевірка price gate (acceptance)

Швидкий чек-лист, яку поведінку гість має бачити:

| Сторінка                | Гість                                            | Авторизований           |
| ----------------------- | ------------------------------------------------ | ----------------------- |
| `/` (Топ / Sale / New)  | CTA замість €/₴                                  | Ціни як раніше          |
| `/catalog`              | CTA на картках                                   | Ціни на картках         |
| `/lots`                 | CTA на картках, кнопка «Увійти» замість «Додати» | Ціни + «Додати»         |
| `/lot/[barcode]`        | CTA-блок, «Увійти, щоб замовити»                 | Ціни + «Додати»         |
| `/product/[slug]`       | CTA замість прайсу, «Увійти, щоб додати в кошик» | Ціни + AddProductToCart |
| `/sale`, `/new`, `/top` | CTA на картках                                   | Ціни                    |
| `/api/mobile/*`         | Без змін (Bearer)                                | Без змін (Bearer)       |
| `/account`              | Redirect на `/login`                             | Профіль + замовлення    |

## Логи

Login endpoint логує помилки структуровано (PII не пишеться у текст логу — тільки error message):

```
[L-TEX] customer login failed { error: "..." }
[L-TEX] cart merge on login failed { error: "..." }
```

Це консистентно з S64 PII-аудитом.
