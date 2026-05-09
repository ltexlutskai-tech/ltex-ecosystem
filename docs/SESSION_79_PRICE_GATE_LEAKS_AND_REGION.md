# Session 79 — Price gate leaks + region field on login

**Type:** Worker session (mini)
**Branch:** `claude/price-gate-region-{XXXX}`
**Goal:** Закрити 2 price-gate leaks (similar products + recommendations) і додати поле "Область" у login form з вибором з 24 областей України.

---

## ⚠️ HARD RULES

1. **DO NOT change Customer schema** — поле `city` вже існує у `Customer` (free-text, max 100). Reuse це поле для області (rename label "Область" не потрібен у DB).
2. **DO NOT change DB-stored phone format** — обробляти як зараз.
3. **Price gate** — server-side strip identical to S73 pattern (`getCurrentCustomer()` → null → strip).
4. **DO NOT remove existing customer.city** — навіть якщо порожньо для existing leads.

---

## Source / context

- **Issue 1**: Скріншот product page → секція "Схожі товари" показує цифри €X.XX/кг для гостя. Причина: `getRecommendations(productId, 6)` у `apps/store/app/(store)/product/[slug]/page.tsx:471` повертає `prices` без price-strip.
- **Issue 2**: Скріншот home (рекомендації + recently viewed) → теж показують ціни. Причина: `/api/recommendations/route.ts` не strip-ить ціни для гостей. Client-side `recommendations-section.tsx` отримує дані як є.
- **Issue 3**: Користувач хоче поле "Область" у login form (`/login`). Customer model уже має `city: String?` — використовуй це поле.

---

## Tasks

### Task 1: Strip prices for guests on product page

`apps/store/app/(store)/product/[slug]/page.tsx` — у `RecommendationsSection`:

```typescript
async function RecommendationsSection({ productId }: { productId: string }) {
  const customer = await getCurrentCustomer();
  let [similar, boughtTogether] = await Promise.all([
    getRecommendations(productId, 6),
    getFrequentlyBoughtTogether(productId, 4),
  ]);

  if (!customer) {
    similar = stripPricesForGuests(similar);
    boughtTogether = stripPricesForGuests(boughtTogether);
  }

  if (similar.length === 0 && boughtTogether.length === 0) return null;
  // ...rest unchanged
}
```

Імпорти:

```typescript
import { getCurrentCustomer, stripPricesForGuests } from "@/lib/customer-auth";
```

⚠️ Перевір що `stripPricesForGuests` (S73 helper) signature підходить — він приймає array of products з `prices` field. Якщо різниться shape — adapt.

### Task 2: Strip prices in /api/recommendations

`apps/store/app/api/recommendations/route.ts`:

```typescript
import { getCurrentCustomer, stripPricesForGuests } from "@/lib/customer-auth";

export async function GET(request: Request) {
  // ...existing parsing of `seen` query param
  const customer = await getCurrentCustomer();

  let products = await /* existing query */;

  if (!customer) {
    products = stripPricesForGuests(products);
  }

  return NextResponse.json({ products });
}
```

Перевір що `stripPricesForGuests` accepts shape returned by цей endpoint. Якщо endpoint повертає mobile-shape — використай separate strip helper або adapt.

### Task 3: Add region field to login

#### 3.1 Constants — `packages/shared/src/constants/business.ts`

Додай 24 області + AR Crimea + Київ + Севастополь (27 entries):

```typescript
export const UA_REGIONS = [
  "Вінницька",
  "Волинська",
  "Дніпропетровська",
  "Донецька",
  "Житомирська",
  "Закарпатська",
  "Запорізька",
  "Івано-Франківська",
  "Київська",
  "Кіровоградська",
  "Луганська",
  "Львівська",
  "Миколаївська",
  "Одеська",
  "Полтавська",
  "Рівненська",
  "Сумська",
  "Тернопільська",
  "Харківська",
  "Херсонська",
  "Хмельницька",
  "Черкаська",
  "Чернівецька",
  "Чернігівська",
  "АР Крим",
  "м. Київ",
  "м. Севастополь",
] as const;
export type UaRegion = (typeof UA_REGIONS)[number];
```

Експортуй з `index.ts`.

#### 3.2 API extend — `apps/store/app/api/auth/customer/login/route.ts`

Розшир Zod schema:

```typescript
const schema = z.object({
  phone: z.string().min(8).max(32),
  name: z.string().min(1).max(100),
  city: z.string().max(100).optional().nullable(), // NEW
});
```

В upsert / update logic — якщо `parsed.data.city` наданий → запиши/оновіти у Customer:

```typescript
if (!customer) {
  customer = await prisma.customer.create({
    data: {
      phone,
      name: parsed.data.name,
      city: parsed.data.city ?? null, // NEW
    },
    select: { id: true, name: true },
  });
  wasCreated = true;
} else {
  // Update name AND city if changed
  const updates: { name?: string; city?: string | null } = {};
  if (customer.name !== parsed.data.name && parsed.data.name)
    updates.name = parsed.data.name;
  if (parsed.data.city !== undefined) updates.city = parsed.data.city;
  if (Object.keys(updates).length > 0) {
    await prisma.customer.update({ where: { id: customer.id }, data: updates });
  }
}
```

Зверни увагу — `customer` select треба розширити щоб включати `city` для compare логіки. Або просто завжди оновлюй.

#### 3.3 Login form — `apps/store/app/(store)/login/login-form.tsx`

Додай `<select>` для region:

```tsx
import { UA_REGIONS } from "@ltex/shared";

// state
const [city, setCity] = useState("");

// JSX (між name i submit):
<div>
  <label className="block text-sm font-medium mb-1">Область</label>
  <select
    value={city}
    onChange={(e) => setCity(e.target.value)}
    className="w-full px-3 py-2 border border-gray-300 rounded bg-white"
  >
    <option value="">— Не обрано —</option>
    {UA_REGIONS.map((r) => (
      <option key={r} value={r}>
        {r}
      </option>
    ))}
  </select>
</div>;
```

Submit body include city:

```typescript
body: JSON.stringify({
  phone: phoneRaw,
  name: name.trim(),
  city: city || null,  // NEW
}),
```

⚠️ Field — НЕ required (login можливий без області). Submit-button validation тільки phone + name (без city).

#### 3.4 Profile form у /account

`apps/store/app/(store)/account/...` (S73) має ProfileForm — там teж може бути text input для city. Якщо він є → upgrade на той самий dropdown з UA_REGIONS. Якщо нема — skip.

#### 3.5 i18n у `lib/i18n/uk.ts`

```typescript
dict.auth.regionLabel = "Область";
dict.auth.regionPlaceholder = "— Не обрано —";
```

### Task 4: Telegram new-lead notification — include region

Маленьке оновлення `notifyNewLead` (S76, у `lib/notifications.ts`) — додати city у message:

```typescript
export async function notifyNewLead(params: {
  customerId: string;
  phone: string;
  name: string;
  city?: string | null; // NEW
  source?: string;
}): Promise<void> {
  // ...existing
  const message = [
    `🆕 *Новий лід*`,
    ``,
    `*Імʼя:* ${escapeMarkdown(params.name)}`,
    `*Телефон:* \`${params.phone}\``,
    ...(params.city ? [`*Область:* ${escapeMarkdown(params.city)}`] : []), // NEW
    `*Джерело:* ${params.source ?? "web"}`,
    // ...
  ].join("\n");
  // ...
}
```

Update calls у login route + quick-order route — pass city.

### Task 5: Tests

- `app/api/auth/customer/login/route.test.ts` — test з city → Customer створено з city
- `lib/notifications.test.ts` — test що message містить _Область:_ коли передано city
- `app/(store)/login/...` — test render наявності select з UA_REGIONS

---

## Acceptance criteria

- [ ] `pnpm format:check`/`typecheck`/`test`/`build` зелені
- [ ] Гість на `/product/[slug]` "Схожі товари" → "Увійдіть щоб побачити ціну" замість €X.XX
- [ ] Гість на home "Рекомендоване для вас" / "Нещодавно переглянуті" → те саме
- [ ] Залогінений customer бачить ціни в обох секціях
- [ ] Login form має dropdown "Область" з 27 опціями (24 області + 3 спец)
- [ ] city зберігається у Customer на новому login
- [ ] Existing customer login з city → city оновлюється у DB
- [ ] TG notification для нового lead містить рядок "Область: ..." коли передано
- [ ] Push на `claude/price-gate-region-{XXXX}` (НЕ merge!)

---

## User-action post-merge

`.\scripts\deploy.ps1` — UI + code only redeploy

---

## Reference

- `apps/store/lib/customer-auth.ts` — `getCurrentCustomer`, `stripPricesForGuests` (S73)
- `apps/store/app/(store)/product/[slug]/page.tsx:471` — RecommendationsSection
- `apps/store/app/api/recommendations/route.ts` — client-side recommendations endpoint
- `apps/store/app/(store)/login/login-form.tsx` — S77 baseline
- `apps/store/app/api/auth/customer/login/route.ts` — S73 login route
- `apps/store/lib/notifications.ts::notifyNewLead` — S76
- Customer schema (`packages/db/prisma/schema.prisma:147`) — `city: String?` already exists
