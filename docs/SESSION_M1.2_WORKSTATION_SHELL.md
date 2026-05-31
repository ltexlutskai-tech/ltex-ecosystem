# Session M1.2 — Workstation Shell + Dashboard + Settings

**Type:** Worker session (велика, ~30-35 файлів — sidebar + header + dashboard + settings + 10 page-stubs)
**Branch:** `claude/manager-m1-2-shell-{XXXX}`
**Goal:** Заміна placeholder dashboard на повноцінний **робочий стіл** для менеджера: лівий sidebar з навігацією, верхній header з пошуком/ШК/sync-індикатором/профілем, центральний робочий стіл з 4 плитками-ярликами + курси валют + статистика менеджера. Налаштування (`/manager/settings`) як мінімальна форма (профіль + Telegram pair + сповіщення + сесії). Усі sidebar-пункти — заглушки "Буде у наступних оновленнях".

**Parent spec:** [`docs/MANAGER_APP_STRATEGY.md`](MANAGER_APP_STRATEGY.md). **Backlog ref:** [`docs/M1_BACKLOG.md`](M1_BACKLOG.md) → M1.2.

**User decisions (2026-05-13, locked):**

- Sidebar = лівий вертикальний (modern Gmail/Notion style).
- 4 базові плитки на dashboard: Замовлення / Реалізація / Оплати / Маршрут (НЕ Мішок, НЕ Месенджер).
- Sync-блок з 1С прибрано — тільки маленький індикатор "Синхронізовано N хв тому" + кнопка-іконка "Оновити".
- Курси валют: всі бачать, **редагувати може тільки admin**, при зміні пише назад у 1С.
- Профіль (хедер): ПІБ + кількість моїх клієнтів + сумарний борг.
- ШК-сканер: камера + manual input (без USB-readers).
- Швидкі іконки header: лупа-пошук (Ctrl+K) + дзвінок сповіщень.
- Додаткові sidebar розділи: Презентації/Завдання, Прайс, Нагадування, Закриття старих замовлень.

---

## ⚠️ HARD RULES

1. **DO NOT touch** `/admin/*` AND `apps/store/middleware.ts`, `next.config.js` — це не моя зона.
2. **DO NOT touch** `apps/mobile-client/`.
3. **DO NOT touch** customer auth endpoints або `/api/mobile/*`.
4. **DO NOT touch** existing M1.1 auth endpoints `/api/v1/manager/auth/*` — тільки ДОДАВАЙ нові endpoints.
5. **DO NOT change** Prisma schema — M1.2 не потребує DB-змін. Reuse: `User`, `UserRefreshToken`, `ExchangeRate`, `ClientAssignment`.
6. **DO NOT** імплементовувати реальну sync-логіку з 1С — тільки UI заглушки (state hardcode або mock JSON).
7. **DO NOT** імплементовувати реальний Telegram pairing — тільки UI: кнопка "Прив'язати" показує QR-заглушку.
8. **DO NOT** імплементовувати ШК-сканер логіку — тільки UI: input + кнопка "📷" (поки не клікабельна або просто відкриває toast "Скоро").
9. **Reuse** `@ltex/ui` (Button, Input, Card, Dialog, Sheet, Toaster, useToast, Badge, Separator).
10. **Reuse** `lib/auth/manager-auth.ts::getCurrentUser` + `requireRole` для auth gating.
11. Усі sidebar-пункти крім "Робочий стіл", "Користувачі", "Налаштування" — link на route де є тільки `<UnderConstruction />` компонент з текстом "Цей розділ буде у наступних оновленнях" + назва наступної сесії що додасть функціонал (M1.3 / M1.5 і т.д.).

---

## Big picture

Що менеджер бачить після логіну (`/manager`):

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  L-TEX Manager       [🔍 Пошук...]  [📷 ШК...]   Sync 12с тому ⟳   🔔3  Кузенко  ⌄│
├─────────────────┬────────────────────────────────────────────────────────────────┤
│ 🏠 Робочий стіл │                                                                 │
│ 📋 Замовлення   │   Вітаємо, Кузенко Тарас!                                      │
│ 🚚 Реалізація   │   ────────────────────────                                     │
│ 💰 Оплати       │   Ваші клієнти: 47 · Загальний борг: 12 450 ₴                  │
│ 🗺️ Маршрут     │                                                                 │
│                 │   Курси:  EUR 52 грн   ·   USD 44 грн   ✏️ (admin only)        │
│ 👥 Клієнти      │                                                                 │
│ 🎁 Презентації  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────┐│
│ 📊 Прайс        │   │ 📋          │  │ 🚚          │  │ 💰          │  │ 🗺️    ││
│ 🔔 Нагадування  │   │ Замовлення  │  │ Реалізація  │  │ Оплати      │  │ Маршру ││
│ 📁 Закриття...  │   │ 3 нові      │  │ 5 чекає     │  │ 2 у касі    │  │ Немає  ││
│                 │   └─────────────┘  └─────────────┘  └─────────────┘  └────────┘│
│ 💬 Чат   ⓘ3     │                                                                 │
│                 │                                                                 │
│ 👤 Користувачі  │                                                                 │
│ ⚙️ Налаштування│                                                                 │
└─────────────────┴────────────────────────────────────────────────────────────────┘
```

На mobile (<1024px) sidebar ховається в drawer (Sheet), відкривається через hamburger menu icon у header.

---

## Файли — повний перелік

### Нові файли

```
apps/store/app/manager/(workstation)/layout.tsx                ← OVERWRITE existing placeholder
apps/store/app/manager/(workstation)/page.tsx                  ← OVERWRITE existing placeholder

apps/store/app/manager/(workstation)/_components/
  sidebar.tsx                       ← <ManagerSidebar> server component
  sidebar-nav-link.tsx              ← <NavLink href icon label badge?> client (active highlight)
  sidebar-mobile-trigger.tsx        ← Hamburger button + Sheet для mobile
  header.tsx                        ← <ManagerHeader> з search/scanner/sync/notif/profile
  header-search.tsx                 ← Search input client (поки заглушка з Ctrl+K shortcut)
  header-barcode.tsx                ← Barcode input + camera-button (поки toast "Скоро")
  header-sync-indicator.tsx         ← "Синхронізовано Xс тому" + refresh button (mock state)
  header-notifications-bell.tsx     ← 🔔 з badge, dropdown пустий (поки) — preparing для M1.10
  header-profile-menu.tsx           ← ПІБ + chevron, dropdown {Налаштування, Вийти}
  dashboard-greeting.tsx            ← "Вітаємо, X!"
  dashboard-stats-row.tsx           ← "X клієнтів · Y грн боргу"
  dashboard-currency-row.tsx        ← EUR/USD display + edit icon (admin only)
  dashboard-currency-edit-modal.tsx ← Dialog для admin, 2 inputs + Save
  dashboard-tiles.tsx               ← 4 plate-tiles grid
  dashboard-tile.tsx                ← Single tile component (icon, title, count, link)
  under-construction.tsx            ← Reusable placeholder для майбутніх routes

apps/store/app/manager/(workstation)/orders/page.tsx           ← <UnderConstruction session="M1.5" />
apps/store/app/manager/(workstation)/sales/page.tsx            ← <UnderConstruction session="M1.6" />
apps/store/app/manager/(workstation)/payments/page.tsx         ← <UnderConstruction session="M1.6" />
apps/store/app/manager/(workstation)/routes/page.tsx           ← <UnderConstruction session="M1.7" />
apps/store/app/manager/(workstation)/customers/page.tsx        ← <UnderConstruction session="M1.3" />
apps/store/app/manager/(workstation)/presentations/page.tsx    ← <UnderConstruction session="M2.2" />
apps/store/app/manager/(workstation)/prices/page.tsx           ← <UnderConstruction session="M1.4" />
apps/store/app/manager/(workstation)/reminders/page.tsx        ← <UnderConstruction session="M1.9" />
apps/store/app/manager/(workstation)/closures/page.tsx         ← <UnderConstruction session="M2.1" />
apps/store/app/manager/(workstation)/chat/page.tsx             ← <UnderConstruction session="M1.8" />

apps/store/app/manager/(workstation)/settings/page.tsx                          ← Real Settings page
apps/store/app/manager/(workstation)/settings/_components/profile-section.tsx
apps/store/app/manager/(workstation)/settings/_components/change-password-modal.tsx
apps/store/app/manager/(workstation)/settings/_components/telegram-section.tsx  ← заглушка з кнопкою "Прив'язати"
apps/store/app/manager/(workstation)/settings/_components/notify-channels-section.tsx
apps/store/app/manager/(workstation)/settings/_components/sessions-section.tsx
apps/store/app/manager/(workstation)/settings/_components/logout-button.tsx

apps/store/app/api/v1/manager/me/route.ts                                       ← PATCH (update fullName, notifyChannels)
apps/store/app/api/v1/manager/me/change-password/route.ts                       ← POST (verify current + set new)
apps/store/app/api/v1/manager/me/sessions/route.ts                              ← GET (list refresh tokens active)
apps/store/app/api/v1/manager/me/sessions/[id]/route.ts                         ← DELETE (revoke single)
apps/store/app/api/v1/manager/dashboard/stats/route.ts                          ← GET (clientCount, totalDebt, ratesEur, ratesUsd, syncStatus, sessionCounts)
apps/store/app/api/v1/manager/admin/rates/route.ts                              ← POST (admin only — upsert ExchangeRate, fire-and-forget sync назад у 1С stub)

apps/store/lib/validations/manager-me.ts                                        ← Zod schemas
apps/store/lib/validations/manager-rates.ts                                     ← Zod

apps/store/app/api/v1/manager/me/route.test.ts                                  ← ≥4 tests
apps/store/app/api/v1/manager/me/change-password/route.test.ts                  ← ≥3 tests
apps/store/app/api/v1/manager/dashboard/stats/route.test.ts                     ← ≥2 tests
apps/store/app/api/v1/manager/admin/rates/route.test.ts                         ← ≥3 tests
```

### Edit існуючих файлів

```
apps/store/lib/auth/manager-auth.ts                            ← export MANAGER_ACCESS_COOKIE constant (якщо не expose)
apps/store/app/manager/(auth)/layout.tsx                       ← БЕЗ ЗМІН (auth pages не торкаємо)
```

---

## Detailed tasks

### Task 1 — Layout та sidebar

**`apps/store/app/manager/(workstation)/layout.tsx`** (server component):

```typescript
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ManagerSidebar } from "./_components/sidebar";
import { ManagerHeader } from "./_components/header";
import { Toaster } from "@ltex/ui";

export default async function WorkstationLayout({
  children,
}: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <ManagerHeader user={user} />
      <div className="flex flex-1 overflow-hidden">
        <ManagerSidebar user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
```

**`_components/sidebar.tsx`** (server component — читає `user.role` для admin gating):

```typescript
import { SidebarNavLink } from "./sidebar-nav-link";

const PRIMARY_LINKS = [
  { href: "/manager", label: "Робочий стіл", icon: "Home" },
  { href: "/manager/orders", label: "Замовлення", icon: "ClipboardList" },
  { href: "/manager/sales", label: "Реалізація", icon: "Truck" },
  { href: "/manager/payments", label: "Оплати", icon: "Wallet" },
  { href: "/manager/routes", label: "Маршрут", icon: "Map" },
];
const SECONDARY_LINKS = [
  { href: "/manager/customers", label: "Клієнти", icon: "Users" },
  { href: "/manager/presentations", label: "Презентації / Завдання", icon: "Gift" },
  { href: "/manager/prices", label: "Прайс", icon: "BarChart3" },
  { href: "/manager/reminders", label: "Нагадування", icon: "Bell" },
  { href: "/manager/closures", label: "Закриття старих замовлень", icon: "FolderClock" },
];
const TERTIARY_LINKS = [
  { href: "/manager/chat", label: "Чат", icon: "MessageCircle", badge: 0 },
];

export function ManagerSidebar({ user }: { user: { role: "manager" | "senior_manager" | "admin" } }) {
  return (
    <aside className="hidden w-60 flex-col border-r bg-white p-3 lg:flex">
      <NavSection links={PRIMARY_LINKS} />
      <div className="my-3 border-t" />
      <NavSection links={SECONDARY_LINKS} />
      <div className="my-3 border-t" />
      <NavSection links={TERTIARY_LINKS} />
      <div className="my-3 border-t" />
      {user.role === "admin" && (
        <SidebarNavLink href="/manager/admin/users" label="Користувачі" icon="UserCog" />
      )}
      <SidebarNavLink href="/manager/settings" label="Налаштування" icon="Settings" />
    </aside>
  );
}

function NavSection({ links }: { links: typeof PRIMARY_LINKS }) {
  return (
    <nav className="space-y-1">
      {links.map((l) => <SidebarNavLink key={l.href} {...l} />)}
    </nav>
  );
}
```

**`_components/sidebar-nav-link.tsx`** (client — usePathname для active state):

```typescript
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

export function SidebarNavLink({
  href, label, icon, badge,
}: { href: string; label: string; icon: keyof typeof Icons; badge?: number }) {
  const path = usePathname();
  const active = path === href || (href !== "/manager" && path.startsWith(href));
  const Icon = Icons[icon] as React.ComponentType<{ className?: string }>;
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-green-50 font-medium text-green-700"
          : "text-gray-700 hover:bg-gray-100",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
```

⚠️ `lucide-react` уже у проді (admin sidebar використовує). Не додавай нову бібліотеку.

**Mobile drawer:** `<ManagerSidebar>` приховано на <1024px (`hidden lg:flex`). Окремий `<SidebarMobileTrigger>` — кнопка `Menu` icon у header, відкриває Sheet з тим самим списком.

### Task 2 — Header

**`_components/header.tsx`** (server):

```typescript
import { HeaderSearch } from "./header-search";
import { HeaderBarcode } from "./header-barcode";
import { HeaderSyncIndicator } from "./header-sync-indicator";
import { HeaderNotificationsBell } from "./header-notifications-bell";
import { HeaderProfileMenu } from "./header-profile-menu";
import { SidebarMobileTrigger } from "./sidebar-mobile-trigger";
import Link from "next/link";

export function ManagerHeader({ user }: { user: { fullName: string; role: string } }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4 lg:px-6">
      <SidebarMobileTrigger />
      <Link href="/manager" className="text-lg font-bold text-green-700">
        L-TEX Manager
      </Link>
      <div className="flex-1 lg:ml-4 lg:flex lg:max-w-lg lg:items-center lg:gap-2">
        <HeaderSearch />
        <HeaderBarcode />
      </div>
      <HeaderSyncIndicator />
      <HeaderNotificationsBell unreadCount={0} />
      <HeaderProfileMenu user={user} />
    </header>
  );
}
```

- **`header-search.tsx`**: `<Input placeholder="Пошук...">` (Ctrl+K shortcut listens window.onkeydown, focus-ить інпут). При submit — поки `toast({ description: "Пошук буде у M1.3" })`. Це **заглушка**.
- **`header-barcode.tsx`**: `<Input placeholder="📷 ШК...">` + іконка-кнопка камери. Submit / click camera — `toast({ description: "Сканер ШК буде у M1.4" })`. Це заглушка.
- **`header-sync-indicator.tsx`**: показує "Синхронізовано **X** тому" (формат `formatDistanceToNow` з date-fns). Кнопка `↻` справа. Дані прийдуть з `/api/v1/manager/dashboard/stats` → `syncStatus.lastSyncAt`. Якщо null → "Не синхронізовано" + кнопка disabled. **Початково: hardcode `lastSyncAt = new Date()`** у заглушці (буде real у M1.3).
- **`header-notifications-bell.tsx`**: `<button>` з іконкою Bell + badge з лічильником. Click — `<Dropdown>` показує "Немає нових сповіщень" (поки). Унікальний компонент бо у M1.9 туди підключиться real feed.
- **`header-profile-menu.tsx`**: показує `user.fullName` + chevron. Dropdown: "Налаштування" (link), "Вийти" (POST `/api/v1/manager/auth/logout` → `redirect("/manager/login")`).

### Task 3 — Dashboard

**`/manager/(workstation)/page.tsx`**:

```typescript
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { DashboardGreeting } from "./_components/dashboard-greeting";
import { DashboardStatsRow } from "./_components/dashboard-stats-row";
import { DashboardCurrencyRow } from "./_components/dashboard-currency-row";
import { DashboardTiles } from "./_components/dashboard-tiles";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic"; // завжди свіжі counts

async function getDashboardData(userId: string, role: string) {
  const [clientCount, latestRates, sessionCounts] = await Promise.all([
    prisma.clientAssignment.count({ where: { userId } }),
    prisma.exchangeRate.findMany({
      where: { currencyTo: "UAH", currencyFrom: { in: ["EUR", "USD"] } },
      orderBy: { date: "desc" },
      distinct: ["currencyFrom"],
      take: 2,
    }),
    // 4 tile counts — поки заглушки бо немає mgr_orders/sales/payments/routes
    Promise.resolve({ orders: 0, sales: 0, payments: 0, routes: 0 }),
  ]);
  const totalDebt = 0; // буде real у M1.3 (sum з mgr_clients.debt)
  const eur = latestRates.find((r) => r.currencyFrom === "EUR")?.rate ?? null;
  const usd = latestRates.find((r) => r.currencyFrom === "USD")?.rate ?? null;
  return { clientCount, totalDebt, eur, usd, sessionCounts, role };
}

export default async function WorkstationDashboard() {
  const user = (await getCurrentUser())!; // layout уже redirect-ить
  const data = await getDashboardData(user.id, user.role);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DashboardGreeting fullName={user.fullName} />
      <DashboardStatsRow clientCount={data.clientCount} totalDebt={data.totalDebt} />
      <DashboardCurrencyRow eur={data.eur} usd={data.usd} canEdit={user.role === "admin"} />
      <DashboardTiles counts={data.sessionCounts} />
    </div>
  );
}
```

- **`dashboard-greeting.tsx`**: `<h1>Вітаємо, {fullName}!</h1>` + subtitle "Робочий стіл L-TEX Manager."
- **`dashboard-stats-row.tsx`**: 2 inline stats: "Мої клієнти: **47**" · "Загальний борг: **12 450 ₴**". Якщо clientCount=0 → "У вас поки немає закріплених клієнтів."
- **`dashboard-currency-row.tsx`**: 2 валюти + edit іконка (тільки admin):
  ```
  Курси: EUR 52 грн   ·   USD 44 грн   ✏️
  ```
  Якщо `canEdit` — клік ✏️ відкриває `<DashboardCurrencyEditModal>`.
  Якщо обидва null — "Курси не завантажені з 1С."
- **`dashboard-currency-edit-modal.tsx`** (admin only): Dialog з 2 inputs (EUR, USD), default values від current rates. Submit → POST `/api/v1/manager/admin/rates` з body `{ EUR: number, USD: number }`. На success — `toast` + close + revalidate.
- **`dashboard-tiles.tsx`**: 4-column grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`). Кожна `<DashboardTile>`.
- **`dashboard-tile.tsx`**: `<Link href={href}>` з Card, icon великий, title, count line. Hover-стан з shadow.

  ```typescript
  export function DashboardTile({
    href, icon, title, count, countLabel,
  }: { href: string; icon: keyof typeof Icons; title: string; count: number; countLabel: string }) {
    const Icon = Icons[icon];
    return (
      <Link href={href} className="block">
        <Card className="p-6 transition-shadow hover:shadow-md">
          <Icon className="mb-3 h-8 w-8 text-green-700" />
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {count === 0 ? `Немає ${countLabel}` : `${count} ${countLabel}`}
          </p>
        </Card>
      </Link>
    );
  }
  ```

  4 tiles:
  - **Замовлення** icon `ClipboardList` → /manager/orders → "нові сьогодні"
  - **Реалізація** icon `Truck` → /manager/sales → "чекають на відвантаження"
  - **Оплати** icon `Wallet` → /manager/payments → "у касі"
  - **Маршрут** icon `Map` → /manager/routes → "точок на день"

### Task 4 — Under-construction stubs (10 routes)

**`_components/under-construction.tsx`**:

```typescript
import { Construction } from "lucide-react";

export function UnderConstruction({ session, description }: { session: string; description?: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <Construction className="mx-auto h-12 w-12 text-amber-500" />
      <h2 className="mt-4 text-xl font-semibold">Цей розділ ще будується</h2>
      <p className="mt-2 text-sm text-gray-500">
        {description ?? "Реальний функціонал з'явиться у наступних оновленнях."}
      </p>
      <p className="mt-1 text-xs text-gray-400">Очікувано: сесія {session}</p>
    </div>
  );
}
```

Кожен з 10 route-stubs — однорядкові server components:

```typescript
// apps/store/app/manager/(workstation)/orders/page.tsx
import { UnderConstruction } from "../_components/under-construction";
export default function OrdersPage() {
  return <UnderConstruction session="M1.5" description="Створення та керування замовленнями." />;
}
```

Описи для кожного:

- orders: "Створення та керування замовленнями." (M1.5)
- sales: "Реалізації, проведення документів, статуси доставки." (M1.6)
- payments: "Каса, прийом готівки, розрахунок здачі." (M1.6)
- routes: "Маршрут на день, кілометраж, гео-трекінг." (M1.7)
- customers: "Клієнти, борги, історія взаємодій." (M1.3)
- presentations: "Презентації товару клієнтам, шарінг у Viber." (M2.2)
- prices: "Прайс-лист товарів за типами цін." (M1.4)
- reminders: "Заплановані нагадування про дзвінки, оплати тощо." (M1.9)
- closures: "Масове закриття старих замовлень клієнтів." (M2.1)
- chat: "Внутрішній чат між менеджерами + чат з клієнтами." (M1.8)

### Task 5 — Settings page

**`/manager/(workstation)/settings/page.tsx`**:

```typescript
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { ProfileSection } from "./_components/profile-section";
import { TelegramSection } from "./_components/telegram-section";
import { NotifyChannelsSection } from "./_components/notify-channels-section";
import { SessionsSection } from "./_components/sessions-section";
import { LogoutButton } from "./_components/logout-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = (await getCurrentUser())!;
  const sessions = await prisma.userRefreshToken.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Налаштування</h1>
      <ProfileSection user={user} />
      <TelegramSection telegramLinked={user.telegramLinked} />
      <NotifyChannelsSection initialChannels={user.notifyChannels} />
      <SessionsSection sessions={sessions} />
      <LogoutButton />
    </div>
  );
}
```

**ProfileSection** (client):

- Read-only email (display only)
- Editable fullName з save-on-blur через PATCH `/api/v1/manager/me`
- "Змінити пароль" — кнопка відкриває `<ChangePasswordModal>`

**ChangePasswordModal** (client, Dialog):

- 3 fields: current password, new password, confirm new
- Frontend validate: new ≥12 chars, ≥1 digit, ≥1 letter, confirm matches
- POST `/api/v1/manager/me/change-password` `{ currentPassword, newPassword }`
- On success — toast + close

**TelegramSection** (client):

- Show status: "🟢 Прив'язано до @username" АБО "⚪ Не прив'язано"
- Кнопка "Прив'язати" — поки toast "Telegram pairing буде у M1.10" (placeholder)
- Якщо прив'язано — кнопка "Відв'язати" (поки toast "Скоро")

**NotifyChannelsSection** (client):

- 2 toggle switches: "OS push (у браузері/додатку)" + "Telegram DM"
- Save-on-toggle через PATCH `/api/v1/manager/me` `{ notifyChannels: ["push"], ... }`

**SessionsSection** (server, бо сесії — read-only список):

- Table з columns: Пристрій (parsed з User-Agent) · IP · Активна з · [Завершити]
- Click "Завершити" — client wrapper → DELETE `/api/v1/manager/me/sessions/{id}`
- Внизу — кнопка "Завершити всі сесії, окрім поточної" (POST `/api/v1/manager/auth/logout?everywhere=true` → redirect /manager/login)

**LogoutButton** (client):

- Простий button → POST `/api/v1/manager/auth/logout` → `router.push("/manager/login")`

### Task 6 — API endpoints

**`PATCH /api/v1/manager/me`:**

- Auth required (manager-auth)
- Zod schema `updateMeSchema`: `{ fullName?: string (min 2, max 120), notifyChannels?: string[] (subset of ["push","telegram"]) }`
- Returns updated user shape

**`POST /api/v1/manager/me/change-password`:**

- Auth required
- Zod: `{ currentPassword: string, newPassword: string з validatePasswordStrength }`
- `verifyPassword(currentPassword, user.passwordHash)` → 401 if wrong
- `hashPassword(newPassword)` → update
- Revoke ALL `UserRefreshToken` для user-а (force re-login на всіх пристроях; current session окремо керується)
- Return 204

**`GET /api/v1/manager/me/sessions`:**

- Auth required
- Returns array of active refresh tokens (id, userAgent, ipAddress, createdAt, expiresAt)

**`DELETE /api/v1/manager/me/sessions/[id]`:**

- Auth required
- Revoke single token. Якщо `id === currentTokenId` — повертає 200 + cookie clear (logout this device).
- Return 204

**`GET /api/v1/manager/dashboard/stats`:**

- Auth required
- Returns: `{ clientCount, totalDebt, eur, usd, syncStatus: { lastSyncAt }, sessionCounts: { orders, sales, payments, routes } }`
- Поки sessionCounts hardcode `{ orders: 0, sales: 0, payments: 0, routes: 0 }` бо немає mgr\_\* snapshot.
- `syncStatus.lastSyncAt` поки `new Date()` (буде real value у M1.3 коли sync worker з'явиться).
- 30-секундний `revalidateTag("dashboard-stats")` cache.

**`POST /api/v1/manager/admin/rates`:**

- Auth required, **role=admin only** (`requireRole(["admin"])` → 403 if not)
- Zod schema `updateRatesSchema`: `{ EUR: number().positive(), USD: number().positive() }`
- Upsert `ExchangeRate { currencyFrom: "EUR"/"USD", currencyTo: "UAH", rate, source: "manual" }` для today's date
- TODO comment у коді: `// TODO M1.3+ — sync назад у 1С через MobileExchange.1cws::ЗаписатиКурсВалют`
- Return 200 з updated rates

### Task 7 — Zod schemas

`apps/store/lib/validations/manager-me.ts`:

```typescript
import { z } from "zod";

export const updateMeSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  notifyChannels: z.array(z.enum(["push", "telegram"])).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(12, "Мінімум 12 символів")
    .max(200)
    .refine((v) => /[0-9]/.test(v), "Хоча б одна цифра")
    .refine((v) => /[A-Za-zА-Яа-яҐІЇЄ]/.test(v), "Хоча б одна буква"),
});
```

`apps/store/lib/validations/manager-rates.ts`:

```typescript
import { z } from "zod";

export const updateRatesSchema = z.object({
  EUR: z.number().positive().max(1000),
  USD: z.number().positive().max(1000),
});
```

### Task 8 — Tests

**`/api/v1/manager/me/route.test.ts`** (≥4):

- PATCH happy (fullName) → 200 + user updated
- PATCH no auth → 401
- PATCH invalid fullName (too short) → 400
- PATCH notifyChannels with invalid value → 400

**`/api/v1/manager/me/change-password/route.test.ts`** (≥3):

- Happy → 204, password changed, all refresh tokens revoked
- Wrong current → 401
- Weak new password → 400

**`/api/v1/manager/dashboard/stats/route.test.ts`** (≥2):

- Happy returns shape з expected fields
- No auth → 401

**`/api/v1/manager/admin/rates/route.test.ts`** (≥3):

- Admin user → 200, ExchangeRate upserted
- Non-admin user (role=manager) → 403
- Invalid body (negative number) → 400

---

## Acceptance criteria

- [ ] `/manager` показує повний робочий стіл (header + sidebar + 4 tiles + currency + stats)
- [ ] `/manager/orders` (та ще 9 інших) показують `<UnderConstruction>`
- [ ] `/manager/settings` показує 4 секції + Logout
- [ ] Профіль fullName редагується save-on-blur
- [ ] "Змінити пароль" відкриває modal, працює
- [ ] Notify channels toggles save-on-change
- [ ] Sessions section показує активні сесії, можна "Завершити одну" + "Завершити всі"
- [ ] У ManagerSidebar: пункт "Користувачі" видно ТІЛЬКИ якщо `user.role === "admin"`
- [ ] У DashboardCurrencyRow: ✏️ іконка видна ТІЛЬКИ якщо `user.role === "admin"`
- [ ] CurrencyEditModal працює для admin, POST → 200, після save показуються нові значення
- [ ] Manager (non-admin) користувач робить POST /admin/rates → 403
- [ ] Mobile (<1024px): sidebar збоку відсутній, hamburger + Sheet відкриває drawer з тим самим списком
- [ ] Ctrl+K у будь-якому місці → focus на пошук input
- [ ] Search submit + Barcode scan-button → toast з "Скоро"
- [ ] Logout працює — clear cookies + redirect /manager/login
- [ ] Tests ≥ 12 нових (4 me, 3 change-password, 2 dashboard-stats, 3 admin-rates)
- [ ] `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm -r build` — green
- [ ] 0 нових `any`, 0 нових `@supabase/*` imports
- [ ] **DO NOT** push на main. Тільки на `claude/manager-m1-2-shell-{XXXX}`

---

## User-action post-merge

Жодних DB-міграцій + жодних env vars. Тільки звичайний deploy:

```powershell
cd E:\ltex-ecosystem
git fetch origin
git checkout main
git merge --ff-only origin/claude/m1-orch-merge
.\scripts\deploy.ps1
```

Після deploy відкрий `https://new.ltex.com.ua/manager` — має одразу побачити повний робочий стіл з 4 tiles, sidebar, header. Логін зробити НЕ потрібен (cookie ще активний від M1.1).

Перевір:

- 4 плитки клікаються — кожна веде на заглушку "Цей розділ ще будується"
- Sidebar має 13 пунктів (10 базових + Чат + Користувачі + Налаштування). "Користувачі" + ✏️ біля курсів видно бо ти admin.
- Налаштування → "Змінити пароль" → задай нормальний пароль замість тимчасового `Test123456!@`
- На mobile (resize вікно <1024px або відкрий у мобільному) — sidebar ховається, з'являється гамбургер

---

## Reference

- M1.1 auth: `apps/store/lib/auth/manager-auth.ts` (`getCurrentUser`, `requireRole`), `lib/auth/password.ts` (`hashPassword`, `verifyPassword`, `validatePasswordStrength`)
- `apps/store/app/admin/page.tsx` — pattern для admin dashboard з cards (можна підглянути стилі)
- `apps/store/components/admin/Sidebar.tsx` (якщо існує) — pattern для admin sidebar
- `lucide-react` icons — вже у dependencies (`apps/store/package.json`)
- `date-fns` для `formatDistanceToNow` — вже у dependencies (admin notifications використовують)
- `prisma.exchangeRate` model — вже existing у проді з 1С sync
- `@ltex/ui` components: `Button`, `Input`, `Card`, `Dialog`, `Sheet`, `Toaster`, `useToast`, `Badge`, `Separator`

---

## Out of scope для M1.2

- Реальна sync-логіка з 1С (UI заглушки тільки) — M1.3+
- Реальний Telegram pairing — M1.10
- Реальний ШК-scanner — M1.4
- Реальний пошук — M1.3 (клієнти) + M1.4 (товари)
- Реальні counts у tiles (orders/sales/payments/routes) — M1.5+
- Sync курсу назад у 1С — поки `// TODO M1.3+` коментар
- Notifications dropdown content — M1.9 наповнить (поки порожній)
- "Mark notification as read" — M1.9
