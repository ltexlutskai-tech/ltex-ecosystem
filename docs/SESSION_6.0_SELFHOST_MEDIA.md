# Сесія 6.0 — Задача A: самохостинг медіа (прибрати Supabase Storage)

> Мета: зберігати НОВІ фото товарів і банери на диску сервера замість Supabase Storage.
> Наявні фото НЕ мігруємо (їх приберуть разом зі старими товарами у Задачі B). Без міграцій БД.
> Гілка `claude/charming-ptolemy-40syy0` → merge у `main`. Деплой (+.env +папка) робить user.
> **Обовʼязково:** `tsc --noEmit` + `vitest run` (зачеплені) + `prettier --write` перед комітом.

## A0. Env (документувати в `.env.example`, НЕ хардкодити)

- `MEDIA_ROOT` — абсолютний шлях до папки медіа на сервері (напр. `E:\ltex-storage\media`).
- `MEDIA_PUBLIC_URL` — базовий публічний URL сайту (напр. `https://new.ltex.com.ua`), без хвостового `/`.

## A1. Хелпери `apps/store/lib/media/storage.ts` (новий)

Node `fs/promises` + `path`. Функції:

- `mediaConfigured(): boolean` — чи задано `MEDIA_ROOT`.
- `resolveInsideRoot(rel): string` — нормалізує й **гарантує, що шлях НЕ виходить за межі `MEDIA_ROOT`**
  (захист від `..`). Кидає помилку інакше.
- `saveMediaFile(rel, data: Buffer): Promise<string>` — `mkdir -p` + запис; повертає публічний URL.
- `mediaPublicUrl(rel): string` — `${MEDIA_PUBLIC_URL}/media/${rel(з прямими слешами)}`.
- `deleteMediaByUrl(url): Promise<void>` — best-effort видалення файлу за публічним URL (ігнорує відсутній).
- `readMediaFile(rel): Promise<Buffer | null>` — для роздачі; null коли нема/невалідний шлях.

## A2. Роздача файлів `apps/store/app/media/[...path]/route.ts` (новий)

- `GET` віддає файл з `MEDIA_ROOT` через `readMediaFile(segments.join("/"))`.
- Content-Type за розширенням (webp/jpeg/png/gif/svg/mp4/webm), fallback `application/octet-stream`.
- Заголовок `Cache-Control: public, max-age=31536000, immutable`. 404 коли файлу нема.
- Захист від `..` — уже в `resolveInsideRoot`. Тіло — `Uint8Array`/`Buffer` у `NextResponse`.

## A3. Переписати завантаження (3 місця; sharp-стиснення ЛИШАЄТЬСЯ)

- `apps/store/app/admin/products/actions.ts` → `uploadProductImage`: замість Supabase —
  `saveMediaFile(\`product-images/${productId}/${Date.now()}.webp\`, optimized)`; у БД писати повернений URL.
- той самий файл → `deleteProductImage`: `await deleteMediaByUrl(image.url)` замість Supabase `.remove`.
- `apps/store/app/admin/banners/actions.ts` → `uploadBannerImage`: `saveMediaFile(\`banners/${Date.now()}.webp\`, optimized)`.
- ⚠️ Зберегти всю наявну валідацію (`validateImageFile`) і sharp-пайплайн — міняти ЛИШЕ місце зберігання.

## A4. Конфіг `apps/store/next.config.js`

- У `images.remotePatterns` **додати** `new.ltex.com.ua` (щоб `next/image` приймав нові URL).
- CSP `img-src` — **додати** `https://new.ltex.com.ua` (і `'self'` якщо ще нема).
- ⚠️ **Supabase у CSP/remotePatterns НЕ видаляти зараз** — наявні фото ще на Supabase-URL і зникнуть
  лише після чистки Задачі B; передчасне видалення зламає показ наявних. Додати коментар
  «прибрати \*.supabase.co після чистки товарів (Задача B)». (Це свідоме відхилення від початкового
  формулювання — заради того, щоб не зламати живий сайт у перехідний період.)

## A5. Прибирання

- `createServiceRoleClient` (`lib/supabase/admin.ts`): **спершу grep** усіх використань. Якщо після
  переписування 3 місць він більше НІДЕ не потрібен для Storage — лишити файл (може вживатись для Auth),
  але прибрати непотрібні Storage-імпорти. НЕ видаляти Supabase Auth/клієнти.
- Оновити `.env.example` двома новими змінними + короткий коментар.

## A6. Наслідки (у фінальний звіт user-у)

- Потрібно: 1 папка на диску (`MEDIA_ROOT`), 2 env-змінні, `deploy.ps1`.
- ⚠️ Додати `E:\ltex-storage\media` у щоденний бекап (зараз бекапиться лише БД).
- Мобільний застосунок і сайт читають URL з БД — новий URL веде на `/media/...` цього ж сервера.

## Тести

- Юніт на `resolveInsideRoot` (traversal: `../`, абсолютний шлях, валідний вкладений) — обовʼязково.
- Не ламати наявні тести адмінки.

---

## Задача B (окремо, ПІСЛЯ рішень user) — чистка не-1С товарів

НЕ в цій сесії коду. Потрібні рішення user (він поки відклав):

1. Точний шлях медіа (default `E:\ltex-storage\media`).
2. Чи видаляти порожні категорії після чистки.
3. Що робити з не-1С товарами, які МАЮТЬ історію продажів (лишити / перенести / видалити).

Порядок B (коли готові): `scripts/audit-non-1c.ts` (є) → узгодити цифри → новий
`scripts/delete-non-1c-products.ts` (dry-run default, `--apply --confirm-prod`, пропуск товарів з
OrderItem/SaleItem, каскад фото/цін/лотів/штрихкодів/кошика) → бекап БД → dry-run → apply.
