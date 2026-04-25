# Session 25 — Worker Task: Categories Carousel

**Створено orchestrator-ом:** 2026-04-25
**Пріоритет:** P2 (UX upgrade — categories grid → carousel)
**Очікуваний ефорт:** 1.5-2 години
**Тип:** worker session (small / атомарний)

---

## Контекст

Homepage поки має static grid з 7 категорій (після S24 cleanup). User хоче замінити на **horizontal carousel** з gradient + lucide icon, авторотацією 6 сек, arrows + dots — як на сучасних marketplace (Kasta, Rozetka).

**Render preview (узгоджений з user 2026-04-25):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Категорії товарів                              ←  ●  ○  ○  →    │
│                                                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ [gradient] │  │ [gradient] │  │ [gradient] │  │ [gradient] │ │
│  │ + lucide   │  │ + lucide   │  │ + lucide   │  │ + lucide   │ │
│  │   icon     │  │   icon     │  │   icon     │  │   icon     │ │
│  ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤ │
│  │ ЖІНКАМ     │  │ ЧОЛОВІКАМ  │  │ ДІТЯМ      │  │ ВЗУТТЯ     │ │
│  │ 250 товарів│  │ 180 товарів│  │ 120 товарів│  │ 91 товар   │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Розміри:** card ~240×280, image area top 200px (gradient + icon center), text area 80px.
**Behavior:**

- Desktop: 4 cards visible
- Tablet: 3 cards
- Mobile: 1.5 cards (peek next), swipe gesture
- Auto-rotate every 6 seconds (advance by 1 slide)
- Pause auto-rotate on hover
- Arrows (←→) на desktop only
- Dots indicator under carousel
- Click card → navigate to `/catalog/<slug>`

---

## Branch

`claude/session-25-categories-carousel` від main.

---

## Hard rules

1. **НЕ ламати CI** — `pnpm format:check && pnpm -r typecheck && pnpm -r test && pnpm build` мають бути green
2. **НЕ додавати нові npm dependencies** — використати lucide-react (вже у проекті) для icons; carousel mechanic — vanilla React (transform translateX + setInterval)
3. **НЕ чіпати** інші homepage секції — banner, featured, sale, new, videos, testimonials залишаються як є
4. **НЕ створювати** нові API routes / DB changes — категорії беруться з existing `prisma.category.findMany()` (server-side render)
5. **i18n-дисципліна** — нові strings у `apps/store/lib/i18n/uk.ts` під ключем `home.categoriesCarousel.*`
6. **a11y:** carousel має aria-label, кнопки aria-label-нуті, dots мають role="tab"; keyboard nav (← →) працює коли focus на carousel

---

## Категорії та icon mapping

В DB є 49 категорій, але homepage показує тільки **top-level (parentId IS NULL)** — ~7 штук.

Для кожної категорії потрібен **lucide-react icon** + **gradient color pair**. Хардкодити mapping за slug:

```ts
// apps/store/lib/category-display.ts (новий файл)
import {
  Shirt,
  Footprints,
  Baby,
  Gem,
  Home,
  Sparkles,
  Package,
} from "lucide-react";

export const CATEGORY_DISPLAY: Record<
  string,
  {
    icon: typeof Shirt;
    gradient: string; // tailwind classes
  }
> = {
  zhinky: {
    icon: Shirt,
    gradient: "from-pink-400 to-rose-600",
  },
  choloviky: {
    icon: Shirt,
    gradient: "from-blue-500 to-indigo-700",
  },
  dity: {
    icon: Baby,
    gradient: "from-yellow-400 to-orange-500",
  },
  vzuttya: {
    icon: Footprints,
    gradient: "from-amber-600 to-orange-800",
  },
  aksesuary: {
    icon: Gem,
    gradient: "from-purple-500 to-pink-600",
  },
  tekstyl: {
    icon: Home,
    gradient: "from-teal-400 to-cyan-600",
  },
  igrashky: {
    icon: Sparkles,
    gradient: "from-green-400 to-emerald-600",
  },
};

// Fallback для невідомих slug-ів
export const DEFAULT_CATEGORY_DISPLAY = {
  icon: Package,
  gradient: "from-slate-400 to-slate-600",
};
```

**Worker:** перевір реальні slug-и категорій в DB (через grep по seed файлу або prisma studio). Якщо назви слаги відрізняються (наприклад `women`, `men` замість `zhinky`, `choloviky`) — підкоригуй mapping. Якщо slug-у немає у map — fallback на `DEFAULT_CATEGORY_DISPLAY`.

---

## Файли для створення / редагування

### 1. Новий файл: `apps/store/lib/category-display.ts`

Mapping slug → { icon, gradient } як вище.

### 2. Новий файл: `apps/store/components/store/categories-carousel.tsx`

**Client component** (потрібен state для current slide + setInterval).

**Props:**

```ts
type Category = {
  id: string;
  slug: string;
  nameUk: string;
  productsCount: number;
};

interface CategoriesCarouselProps {
  categories: Category[];
}
```

**State:**

- `currentIndex` (0..N-1)
- `isPaused` (для hover)
- `containerRef` для swipe gesture (touchstart/touchend)

**Logic:**

```ts
useEffect(() => {
  if (isPaused || categories.length <= visibleCount) return;
  const id = setInterval(() => {
    setCurrentIndex((i) => (i + 1) % categories.length);
  }, 6000);
  return () => clearInterval(id);
}, [isPaused, categories.length]);
```

**Render structure:**

```tsx
<section
  className="container mx-auto px-4 py-12"
  aria-label={dict.home.categoriesCarousel.aria}
>
  <div className="flex items-center justify-between mb-6">
    <h2 className="text-2xl font-bold">{dict.home.categoriesCarousel.title}</h2>
    <div className="hidden md:flex gap-2">
      <button onClick={prev} aria-label="Попередня"> <ChevronLeft /> </button>
      <button onClick={next} aria-label="Наступна"> <ChevronRight /> </button>
    </div>
  </div>

  <div
    ref={containerRef}
    onMouseEnter={() => setIsPaused(true)}
    onMouseLeave={() => setIsPaused(false)}
    onTouchStart={...}
    onTouchEnd={...}
    className="overflow-hidden"
  >
    <div
      className="flex gap-4 transition-transform duration-500 ease-out"
      style={{ transform: `translateX(-${currentIndex * (100 / visibleCount)}%)` }}
    >
      {categories.map((cat) => {
        const display = CATEGORY_DISPLAY[cat.slug] ?? DEFAULT_CATEGORY_DISPLAY;
        const Icon = display.icon;
        return (
          <Link
            key={cat.id}
            href={`/catalog/${cat.slug}`}
            className="flex-shrink-0 w-1/2 sm:w-1/3 md:w-1/4 group"
          >
            <div className="rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow">
              <div className={`bg-gradient-to-br ${display.gradient} h-48 flex items-center justify-center`}>
                <Icon className="w-20 h-20 text-white" strokeWidth={1.5} />
              </div>
              <div className="bg-white p-4">
                <h3 className="font-bold uppercase tracking-wide">{cat.nameUk}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {cat.productsCount} {pluralize товарів}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  </div>

  {/* Dots */}
  <div className="flex justify-center gap-2 mt-6" role="tablist">
    {dotsCount.map((i) => (
      <button
        key={i}
        role="tab"
        aria-selected={i === currentIndex}
        onClick={() => setCurrentIndex(i)}
        className={i === currentIndex ? "bg-primary w-8 h-2 rounded-full" : "bg-gray-300 w-2 h-2 rounded-full"}
      />
    ))}
  </div>
</section>
```

**visibleCount** — responsive за breakpoint: 1.5 mobile / 3 tablet / 4 desktop.
Можна через CSS-only (без JS resize listener) використовуючи `w-1/2 sm:w-1/3 md:w-1/4` на cards. Тоді carousel translation: `currentIndex * (100% / visibleCount)`. Але прокрутка за 1 card — треба знати visibleCount у JS. Альтернатива: завжди прокручувати по 1 card (`100% / cards.length`), що працює уніформно. Worker вибирає підхід.

**Pluralize helper:** `apps/store/lib/pluralize.ts` (новий) — `pluralize(count, ['товар', 'товари', 'товарів'])` — українська плюралізація 1 / 2-4 / 5+. Або просто хардкод "X товарів" якщо count > 4 / "1 товар" / "X товари".

### 3. `apps/store/app/(store)/page.tsx`

Замінити поточну Categories grid (старий блок з `<Link href={`/catalog/${slug}`}` у grid layout) на:

```tsx
<CategoriesCarousel categories={categoriesWithCount} />
```

`categoriesWithCount` — вже існує у server-side load, отриманий через `prisma.category.findMany({ where: { parentId: null }, include: { _count: { select: { products: true } } } })`. Якщо треба переформатувати у `{ id, slug, nameUk, productsCount }` — зробити map.

### 4. `apps/store/lib/i18n/uk.ts`

Додати:

```ts
home: {
  // ... existing keys
  categoriesCarousel: {
    title: "Категорії товарів",
    aria: "Карусель категорій товарів",
    prev: "Попередня категорія",
    next: "Наступна категорія",
  },
},
```

### 5. Тест: `apps/store/components/store/categories-carousel.test.tsx`

Мінімальний render test:

- Renders all categories with correct slugs
- Click arrow advances currentIndex
- Click dot jumps to specific slide
- Auto-rotates after 6 sec (use vi.useFakeTimers)

Цільові 4-5 тестів.

---

## Verification checklist

- [ ] Homepage `/` показує carousel замість grid
- [ ] 7 категорій (з DB top-level) видно в carousel
- [ ] Кожна картка має gradient + lucide icon
- [ ] Auto-rotate працює (через 6 сек слайд просувається)
- [ ] Hover на carousel зупиняє auto-rotate
- [ ] Arrows (← →) на desktop працюють
- [ ] Dots indicator показує current slide
- [ ] Click card → navigate to `/catalog/<slug>`
- [ ] Mobile (виміряти у DevTools) — swipe gesture працює, видно 1.5 cards
- [ ] `pnpm format:check`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm build` — all PASS
- [ ] Test count growth: 211 → ~215 (+4 нових)
- [ ] Жоден інший файл не зачеплено (admin, mobile, services, packages)

---

## Out of scope

- Real category photos (поки тільки gradient + icon)
- Категорії з Supabase Storage (admin upload UI)
- Sub-categories у carousel
- Search-as-you-type у carousel
- Animation transitions крім translateX
- DB schema changes
- Newsletter / Quote / Auth changes (окремі сесії)

---

## Commit strategy

**Один atomic commit:**

```
feat(homepage): replace categories grid with auto-rotating carousel

Per user feedback (ecosystem chat 2026-04-25): static grid feels static
for B2B browsing. Carousel with gradient + lucide icon (no real photos
yet) gives more visual energy without blocking on photo upload.

- New components: categories-carousel.tsx + test
- New lib: category-display.ts (slug → icon/gradient mapping)
- Optional: pluralize.ts helper (Ukrainian noun plurals)
- Updated: app/(store)/page.tsx (categories grid → CategoriesCarousel)
- Updated: lib/i18n/uk.ts (new home.categoriesCarousel.* keys)

Behavior: 4 cards desktop / 3 tablet / 1.5 mobile + swipe; 6s auto-rotate
pauses on hover; arrow buttons + dots indicator; a11y compliant.

CI: format + typecheck + 211→~215 tests + build all green.
```

---

## Push

```bash
git push -u origin claude/session-25-categories-carousel
```

Завершити повідомленням orchestrator-у з:

- Branch name (з суфіксом якщо harness додав)
- Test count delta
- Скільки категорій реально знайдено в DB
- Чи довелося допасовувати slug mapping
