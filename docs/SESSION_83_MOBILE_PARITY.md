# Session 83 — Mobile parity з S71-S82

**Type:** Worker session (large)
**Branch:** `claude/mobile-parity-{XXXX}`
**Goal:** Принести mobile-client (Expo SDK 52) у parity з web app після S71-S82. Catalog filters, region field, TG notification на новий mobile lead, oversize subcategory, нові 18 subcategories.

---

## ⚠️ HARD RULES

1. **DO NOT touch mobile auth fundamental flow.** Mobile уже використовує phone+name через `/api/mobile/auth` (НЕ пароль — той самий принцип як web S73). Тільки розшир payload + UI.
2. **DO NOT add price gate на mobile.** Mobile users автентифіковані через JWT — завжди мають доступ до цін. Price gate тільки для web guest. (Web S82 — `/api/mobile/*` endpoints не strip-ять.)
3. **DO NOT change DB schema.** Усі поля існують — `Customer.city`, `Product.isOversize`, range columns.
4. **Reuse `@ltex/shared`** — CATEGORIES, UA_REGIONS, OVERSIZE_SLUG, COUNTRIES, QUALITY_LEVELS уже там. Mobile може імпортувати.
5. **Mobile package.json** — НЕ підіймай Expo SDK (S54 фіксує SDK 52). Тільки app code.
6. Acceptance: `pnpm -r typecheck` зелений включно з mobile-client; `pnpm -r test`.

---

## Поточний стан

- `apps/mobile-client/src/screens/auth/LoginScreen.tsx` — phone+name input → POST `/api/mobile/auth` → JWT cookie у SecureStore
- `apps/mobile-client/src/screens/profile/ProfileScreen.tsx` — показує customer info (без edit якщо нема `/api/mobile/profile` PUT)
- `apps/mobile-client/src/components/CatalogFilterSheet.tsx` — bottom-sheet фільтр з category/quality/season/country/inStock тільки. **Немає** gender/oversize/ranges.
- `apps/mobile-client/src/screens/catalog/CatalogScreen.tsx` — list/grid catalog. Немає XXL+ subcategory selector.
- `apps/store/app/api/mobile/auth/route.ts` — приймає `{ phone, name? }`, find-or-create Customer, видає JWT.

---

## Phase 1: Mobile auth — region field

### 1.1 Update `apps/store/lib/validations.ts`

```typescript
export const mobileAuthSchema = z.object({
  phone: z.string().min(10).max(20),
  name: z.string().min(1).max(200).optional(),
  city: z.string().max(100).optional().nullable(), // NEW
});
```

### 1.2 Update `apps/store/app/api/mobile/auth/route.ts`

Логіка create/update Customer — те саме як S79 web login:

- На create: `data: { phone, name, city: parsed.data.city ?? null }`
- На existing: update name/city **тільки коли DB значення порожнє** (S82 Fix 4 pattern)

```typescript
let wasCreated = false;
let customer = await prisma.customer.findFirst({ where: { phone } });
if (!customer) {
  customer = await prisma.customer.create({
    data: { phone, name: parsed.data.name ?? "", city: parsed.data.city ?? null },
  });
  wasCreated = true;
} else {
  const updates: { name?: string; city?: string | null } = {};
  if (!customer.name?.trim() && parsed.data.name?.trim()) updates.name = parsed.data.name.trim();
  if (customer.city == null && parsed.data.city) updates.city = parsed.data.city;
  if (Object.keys(updates).length > 0) {
    await prisma.customer.update({ where: { id: customer.id }, data: updates });
  }
}

// Fire-and-forget TG notify on new lead (як web S76)
if (wasCreated) {
  notifyNewLead({
    customerId: customer.id,
    phone,
    name: parsed.data.name ?? "(без імені)",
    city: parsed.data.city ?? null,
    source: "mobile",
  }).catch(() => {});
}

const token = await signMobileToken(customer.id);
return NextResponse.json({ token, customer: {...} });
```

### 1.3 Mobile UI — `LoginScreen.tsx`

Додай region picker. Reuse `UA_REGIONS` з `@ltex/shared`.

```tsx
import { UA_REGIONS } from "@ltex/shared";
import { Picker } from "@react-native-picker/picker";
// або власний bottom-sheet picker якщо @react-native-picker не у deps

const [city, setCity] = useState<string>("");

// JSX before submit:
<View>
  <Text>Область</Text>
  <Picker selectedValue={city} onValueChange={setCity}>
    <Picker.Item label="— Не обрано —" value="" />
    {UA_REGIONS.map((r) => (
      <Picker.Item key={r} label={r} value={r} />
    ))}
  </Picker>
</View>;

// Submit body:
fetch("/api/mobile/auth", {
  body: JSON.stringify({ phone, name, city: city || null }),
});
```

⚠️ Якщо `@react-native-picker/picker` не у deps — використай простий bottom-sheet (Modal + ScrollView з 27 опціями) або ActionSheet. Зараз mobile уже має `CatalogFilterSheet` patterns — reuse Modal-based picker.

### 1.4 Mobile Profile screen — show + allow edit region

`apps/mobile-client/src/screens/profile/ProfileScreen.tsx`:

- Показати поточний `customer.city` (з `/api/mobile/profile` GET)
- Дати кнопку "Змінити область" → відкриває picker → on save → POST `/api/mobile/profile/update` (новий endpoint якщо нема, або PATCH existing)

⚠️ Перевір чи `/api/mobile/profile` має update method. Якщо ні — додати PATCH який приймає `{ city, name, email, telegram }` і пише у Customer. Auth via JWT (як інші mobile endpoints).

---

## Phase 2: Mobile catalog filters parity

### 2.1 `CatalogFilterSheet.tsx` — додай нові секції

**Нові filter sections** (порядок як у web):

**Стать (gender):**

```tsx
import { GENDER_OPTIONS } from "@ltex/shared";

const [gender, setGender] = useState<string[]>([]);
// multi-checkbox список GENDER_OPTIONS
```

**К-сть одиниць (шт/кг) range:**

Mobile slider — або reuse own `PriceRangeSlider` component, або 2 number inputs (TextInput keyboardType="numeric"). Mobile UX cleaner з 2-input pattern.

```tsx
const [unitsMin, setUnitsMin] = useState("1");
const [unitsMax, setUnitsMax] = useState("1000");
// два TextInput + label "К-сть одиниць (шт/кг)"
```

**Вага одиниці (кг) range:**
Те саме pattern. Min/max 1-1000.

⚠️ **DROP "Розмір"** filter блок повністю якщо він зараз є — S80 видалив.

### 2.2 `apps/mobile-client/src/screens/catalog/CatalogScreen.tsx`

Forward усі нові query params у API call:

```typescript
const response = await fetch(`/api/mobile/catalog?${params}`);
// params: ...existing, gender (multiple), unitsPerKgMin, unitsPerKgMax, unitWeightMin, unitWeightMax
```

Перевір що mobile використовує `/api/catalog` чи `/api/mobile/catalog` (можливо окремий ендпоїнт). Якщо `/api/catalog` — все вже працює (S82 backend). Якщо `/api/mobile/catalog` — треба добавити подібну filter logic у тому endpoint (або redirect на `/api/catalog`).

### 2.3 XXL+ pseudo-subcategory у mobile

`CatalogFilterSheet.tsx` — у subcategory list (drill-down з S44) — нова `xxl-veliki-rozmiry` має з'явитися автоматично якщо читається з `@ltex/shared` CATEGORIES чи з `/api/categories`.

Перевір що mobile **API endpoint** для catalog розпізнає `OVERSIZE_SLUG` так само як web (lib/catalog.ts). Якщо mobile catalog query інакша — додай той самий handler.

### 2.4 Active filter chips у mobile

Показати active filters як chip row над list. Якщо є S38/S44 такий компонент — extend. Inakше додати простий FlatList horizontal.

---

## Phase 3: Mobile login lead notification

Уже у Phase 1.2 — `notifyNewLead({ source: "mobile" })`. Перевір що TG message форматує `*Джерело:* mobile` коректно (S76 + S79 update). Якщо ні — extend `notifyNewLead` JSDoc список values: `web | mobile | quick-order | telegram-bot`.

---

## Phase 4: Mobile lots screen (опційно)

`apps/mobile-client/src/screens/lots/` — не S82, але S62 quick-order є на web. Якщо mobile lots screen є — синхронізуй так саме filters (gender, sizes-видалений, oversize, ranges) + StatusBadge для NEW.

Якщо mobile lots screen відсутній — Skip.

---

## Phase 5: Tests

### 5.1 Mobile component tests

- `LoginScreen.test.tsx` — render з region picker, submit з city у payload
- `CatalogFilterSheet.test.tsx` — нові filter sections render correctly
- `ProfileScreen.test.tsx` — region display + edit flow

### 5.2 API tests

- `app/api/mobile/auth/route.test.ts` — extend з city: create/update/preserve cases (як S79 web login tests)

### 5.3 Build green

- `pnpm --filter mobile-client run typecheck` — 0 errors (тести можуть бути обмежені у Expo)
- `pnpm -r test` — old + new green

---

## Acceptance criteria

- [ ] `pnpm format:check` зелений
- [ ] `pnpm -r typecheck` зелений (інкл mobile)
- [ ] `pnpm -r test` зелений
- [ ] `pnpm -r build` зелений (web build не зламається)
- [ ] `mobileAuthSchema` приймає `city`
- [ ] Mobile login UI має region picker з UA_REGIONS
- [ ] Mobile profile screen показує + edit `city`
- [ ] `/api/mobile/auth` зберігає city + fire-and-forget TG notify на new lead (`source: "mobile"`)
- [ ] `notifyNewLead` обробляє `source: "mobile"` правильно
- [ ] Mobile catalog filter sheet має gender, unitsPerKg range, unitWeight range
- [ ] "Розмір" filter відсутній (S80 видалення)
- [ ] Mobile catalog screen forward усі нові filter params до API
- [ ] XXL+ subcategory доступна у mobile drill-down
- [ ] Push на `claude/mobile-parity-{XXXX}` (НЕ merge)

---

## User-action post-merge

`.\scripts\deploy.ps1` — web redeploy для mobile API endpoint changes.

⚠️ **Mobile native rebuild не потрібен** поки native APK не distributed. Mobile код merged у main достатньо. Коли S54 EAS Build відновиться — auto-pickup нових features.

---

## Reference

- `apps/store/app/api/auth/customer/login/route.ts` — web login pattern (Phase 1 mirror)
- `apps/store/app/api/mobile/auth/route.ts` — current mobile auth (extend)
- `apps/store/lib/notifications.ts::notifyNewLead` — TG notify (S76)
- `apps/store/components/store/catalog-filters.tsx` — web filter UI (Phase 2 mirror)
- `apps/mobile-client/src/components/CatalogFilterSheet.tsx` — mobile baseline
- `apps/mobile-client/src/screens/auth/LoginScreen.tsx` — current login UI
- `apps/mobile-client/src/screens/profile/ProfileScreen.tsx` — profile view
- `packages/shared/src/constants/business.ts` — UA_REGIONS, GENDER_OPTIONS, COUNTRIES
- `packages/shared/src/constants/categories.ts` — CATEGORIES + OVERSIZE_SLUG
