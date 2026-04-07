# L-TEX Ecosystem — Deploy Checklist

## 1. Supabase (БД)

- [x] Створити Supabase проєкт (ltex-ecosystem, Frankfurt)
- [x] Отримати DATABASE_URL, DIRECT_URL, SUPABASE_URL, ANON_KEY
- [x] Запустити `prisma db push` — створити таблиці
- [x] Запустити `npx tsx prisma/seed.ts` — наповнити БД (805 товарів, 725 лотів)
- [ ] Запустити міграцію FTS: `packages/db/prisma/migrations/20260406_fts_gin_trigram/migration.sql`
- [ ] Створити Storage bucket `product-images` (public)
- [ ] Завантажити фото товарів в Storage

## 2. Netlify (Хостинг)

- [x] Створити сайт на Netlify (stalwart-dango-04a9b9)
- [x] Підключити GitHub репозиторій
- [x] Переключити Production branch на `main`
- [x] Додати Environment variables:
  - `DATABASE_URL` — Supabase connection string (pooler, port 6543)
  - `DIRECT_URL` — Supabase direct connection (port 5432)
  - `NEXT_PUBLIC_SUPABASE_URL` — https://auxrlweedivnffxjwvln.supabase.co
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable key
- [ ] Додати додаткові env vars:
  - `SYNC_API_KEY` — токен для 1C sync API
  - `NEXT_PUBLIC_SITE_URL` — URL сайту
  - `TELEGRAM_BOT_TOKEN` — (опціонально) для нотифікацій
  - `TELEGRAM_CHAT_ID` — (опціонально) для нотифікацій
  - `VIBER_AUTH_TOKEN` — (опціонально) для Viber бота
  - `VIBER_ADMIN_USER_ID` — (опціонально) ID менеджера в Viber

## 3. Telegram бот (опціонально)

- [ ] Створити бота через @BotFather в Telegram
- [ ] Отримати TELEGRAM_BOT_TOKEN
- [ ] Запустити реєстрацію команд: `npx tsx services/telegram-bot/src/setup-commands.ts`
- [ ] Зареєструвати webhook: `SITE_URL=https://your-site.app npx tsx scripts/register-webhooks.ts`

## 4. Viber бот (опціонально)

- [ ] Створити бота на partners.viber.com
- [ ] Отримати VIBER_AUTH_TOKEN
- [ ] Зареєструвати webhook: `SITE_URL=https://your-site.app npx tsx scripts/register-webhooks.ts`

## 5. 1C інтеграція

- [ ] Згенерувати SYNC_API_KEY (будь-який рядок, напр. `openssl rand -hex 32`)
- [ ] Додати SYNC_API_KEY в Netlify env vars
- [ ] Налаштувати 1C для відправки даних на:
  - POST `/api/sync/products` — товари
  - POST `/api/sync/lots` — лоти
  - POST `/api/sync/rates` — курси валют
  - GET `/api/sync/orders/export` — експорт замовлень

## 6. Mobile app (опціонально)

- [ ] `cd apps/mobile-client && npx expo install`
- [ ] Встановити `EXPO_PUBLIC_API_URL` в `.env`
- [ ] `npx expo start` для локальної розробки

## 7. Перевірка

- [ ] Відкрити сайт — головна сторінка з категоріями
- [ ] Каталог — товари відображаються з фільтрами
- [ ] Сторінка товару — деталі, відео, лоти
- [ ] Кошик — додавання лотів, мін. 10 кг
- [ ] Оформлення замовлення — форма працює
- [ ] Admin панель — /admin/login → dashboard
- [ ] Пошук — автокомпліт працює
