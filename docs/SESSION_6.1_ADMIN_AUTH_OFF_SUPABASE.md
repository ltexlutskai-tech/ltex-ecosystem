# Сесія 6.1 — перевести адмін-логін з Supabase Auth на власний JWT

> Мета: `/admin/*` більше НЕ залежить від Supabase Auth. Вхід через нашу таблицю `users`
> (роль admin/owner), перевикористовуючи вже готову менеджерську auth (JWT-cookie
> `ltex_mgr_access`, bcrypt). Рішення user: **лишити сторінку `/admin/login`** (не обʼєднувати з /manager).
> Гілка `claude/charming-ptolemy-40syy0` → merge у `main`. Без міграцій БД (таблиця `users` уже є).
> **Обовʼязково:** `tsc --noEmit` чистий + `vitest run` (зачеплені) + `prettier --write` перед комітом.
> ⚠️ БЕЗПЕКА: не зламати менеджерську auth (`/manager/*`), не зробити адмінку відкритою без сесії.

## Контекст (перевірено)

- `lib/auth/manager-auth.ts::getCurrentUser(req?)` читає JWT з cookie `MANAGER_ACCESS_COOKIE` → повертає `{id,email,role,isActive,...}` або null.
- `lib/auth/jwt.ts`: access-token payload має `sub` + `role` (`ManagerRole`); `verifyAccessToken` валідує.
- `middleware.ts` наразі: `/manager`→`managerGuard`, `/admin`→Supabase `updateSession`. `runtime="nodejs"`.
- `middleware-manager.ts::managerGuard` — зразок: публічні шляхи, verify cookie, redirect на login.
- `app/api/v1/manager/auth/login/route.ts` — ставить cookie `MANAGER_ACCESS_COOKIE` для БУДЬ-ЯКОГО активного user (роль не гейтить на вході).
- `lib/admin-auth.ts::requireAdmin()` — зараз Supabase `getUser`; викликається у **18 файлах** (усі через цей хелпер).
- `scripts/seed-admin-user.ts` — створює admin, але SKIP якщо email існує (пароль не оновлює).

Ролі адміна: **`admin` та `owner`** (константа `ADMIN_ROLES = new Set(["admin","owner"])`).

## Завдання

### 1. `lib/admin-auth.ts::requireAdmin` — на власний JWT

Переписати: `const user = await getCurrentUser();` (без req — читає cookie через `next/headers`).
Якщо `!user` або `!ADMIN_ROLES.has(user.role)` → `throw new Error("Unauthorized: admin access required")`.
Повертати `user.id` (той самий тип string — 18 call-sites не чіпати). Прибрати import Supabase.

### 2. `middleware-admin.ts` (новий) + `middleware.ts`

- Новий `adminGuard(req)` за зразком `managerGuard`: публічний шлях `/admin/login`; verify cookie
  `MANAGER_ACCESS_COOKIE`; якщо є payload і роль ∈ {admin,owner} → пускати; якщо payload є, але роль НЕ адмінська
  → redirect на `/admin/login?forbidden=1` (щоб не було циклу); якщо payload нема → redirect `/admin/login`.
  На публічному `/admin/login` з валідною адмін-сесією → redirect `/admin`.
- `middleware.ts`: `/admin`→`adminGuard` замість `updateSession`. Лишити `runtime="nodejs"`, matcher без змін.

### 3. `app/admin/login/page.tsx` — вхід через наш endpoint

- Замість `supabase.auth.signInWithPassword` → `fetch("/api/v1/manager/auth/login", {method:POST, JSON {email,password}})`.
- Після успіху перевірити роль: `GET /api/v1/manager/auth/me` → якщо роль ∈ {admin,owner} → `window.location.href="/admin"`;
  інакше показати помилку «Немає прав адміністратора» і викликати logout (`POST /api/v1/manager/auth/logout`), cookie прибрати.
- Помилки входу (401) → показати «Невірний email або пароль». Прибрати import Supabase.
- Якщо `?forbidden=1` у URL — показати підказку «Цей акаунт не має прав адміністратора».

### 4. Прибрати Supabase з адмін-серверного коду

- `app/admin/actions.ts`, `app/api/admin/chat/reply/route.ts`, `app/api/admin/stats/route.ts`: вони кличуть
  `requireAdmin()` (уже наш) — прибрати ПРЯМІ import-и Supabase, якщо там лишились лише для auth. НЕ ламати логіку.
- `lib/supabase/*` (`client/server/middleware/admin`): після змін — grep, чи хтось ще імпортує. Якщо НІ —
  **видалити ці файли** + прибрати `@supabase/ssr`/`@supabase/supabase-js` з `apps/store/package.json`
  (і оновити lockfile: `pnpm install`). Якщо десь ще використовується (напр. next.config images) — НЕ чіпати npm-депи,
  лише лишити коментар. **next.config.js CSP/remotePatterns із Supabase — НЕ чіпати** (наявні фото ще на Supabase-URL,
  приберемо у Задачі B).
- `.env.example`: прибрати/позначити застарілими `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` (лишити коментар,
  що потрібні лише до Задачі B для показу старих фото — але для АВТЕНТИФІКАЦІЇ більше НЕ потрібні).

### 5. `scripts/seed-admin-user.ts` — дозволити скидання пароля наявному

Наразі SKIP якщо email існує. Додати: якщо `SEED_ADMIN_RESET` (env, "1"/"true") і user існує →
оновити `passwordHash = hashPassword(SEED_ADMIN_PASSWORD)` + переконатись `isActive=true` і роль ∈ {admin,owner}
(якщо ні — підняти до `owner`). Без прапорця — поведінка як зараз (skip). Оновити docstring з прикладом reset.

## Тести

- `requireAdmin`: admin/owner → ok; manager/warehouse/null → throw. (мок getCurrentUser).
- `adminGuard`: нема cookie → redirect login; валідний admin → next; валідний не-admin → redirect login?forbidden.
- Не зламати наявні auth-тести (`middleware-manager`, manager login).

## ⚠️ Деплой (user, окремо — НЕ в цій сесії)

- `git pull` → `pnpm install --frozen-lockfile --prod=false` (якщо чіпали package.json) → `deploy.ps1` (повний білд — змінюється login page).
- Сідінг адміна (задати НОВИЙ пароль):
  `$env:SEED_ADMIN_EMAIL="..."; $env:SEED_ADMIN_PASSWORD="<12+>"; $env:SEED_ADMIN_RESET="1"; pnpm --filter @ltex/store exec tsx scripts/seed-admin-user.ts`
- Логін на `/admin/login` новим email+паролем. Supabase для входу більше не потрібен (проєкт можна не піднімати).
- Повне видалення Supabase-проєкту — лише ПІСЛЯ Задачі B (наявні фото ще на Supabase-URL).

## Ризик-контроль

- НЕ видаляти менеджерську auth. Перевикористання `getCurrentUser`/`signAccessToken` — без дублювання секретів.
- `MANAGER_JWT_SECRET` уже заданий (менеджерка працює) — нового env немає.
- Якщо новий вхід не спрацює — у user лишається RDP-доступ до сервера, щоб перезапустити сідінг.
