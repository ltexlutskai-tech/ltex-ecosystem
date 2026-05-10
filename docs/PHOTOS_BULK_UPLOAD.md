# Bulk-завантаження фото товарів з папки `2025-2026-named/`

Двофазна процедура: спершу зрізати папку до ≤10 фото на код, потім завантажити на сайт із заміною старих фото.

## Передумови

- Папка `./2025-2026-named/` лежить у корені проекту на сервері (Windows).
- Імена фото у форматі `(NNNN) Назва.jpg`, `(NNNN) Назва_2.jpg`, або `Назва (NNNN).jpg`. `NNNN` — `Product.code1C`.
- У `apps/store/.env` (або кореневому `.env`) є:
  - `DATABASE_URL` — local PostgreSQL
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Запуск з кореня проекту в PowerShell.

## Phase 1 — створити папку з ≤10 фото на код

Dry-run спочатку, щоб побачити які коди мають > 10 фото і скільки буде skipped:

```powershell
pnpm exec tsx scripts/trim-photos-folder.ts ./2025-2026-named ./2025-2026-named-trimmed
```

Якщо звіт виглядає ОК, фактично копіювати:

```powershell
pnpm exec tsx scripts/trim-photos-folder.ts ./2025-2026-named ./2025-2026-named-trimmed --apply
```

Опції:

- `--max=N` — змінити ліміт (default 10)
- `--apply` — без нього лише dry-run

Скрипт згенерує `./2025-2026-named-trimmed/trim-report.md` зі списком кодів-перевищувачів і файлів, які НЕ потрапили у trimmed папку. Перегляньте — якщо хочете якийсь "skipped" файл замість "kept", вручну переіменуйте у початковій папці (наприклад поміняйте `_3` ↔ `_15`) і запустіть Phase 1 ще раз.

## Phase 2 — завантажити на сайт із заміною старих фото

Dry-run щоб побачити, скільки товарів знайдено в БД, скільки артикулів без матча:

```powershell
pnpm exec tsx scripts/upload-photos.ts ./2025-2026-named-trimmed --dry-run
```

Якщо код-зі-склейкою (`(NNNN)`) не знайдено у `Product.code1C` — звіт покаже список. Це означає що або:

- товар з таким `code1C` не імпортовано (треба сначала S71-style import)
- code у фото — не code1C, а щось інше (треба mapping table — окрема задача)

Як готові — запустити фактичне завантаження зі заміною:

```powershell
pnpm exec tsx scripts/upload-photos.ts ./2025-2026-named-trimmed --replace --max-per-product=10
```

Що робить `--replace`:

1. Для кожного знайденого товару спершу `LIST` усіх файлів під префіксом `${productId}/` у Supabase Storage.
2. Bulk `DELETE` цих файлів.
3. `prisma.productImage.deleteMany({ where: { productId } })` — видалити рядки.
4. Завантажити нові 10 (full + thumb) через існуючий Sharp pipeline (1200×1200 webp q85 для full; 400×400 webp q80 для thumb).
5. `prisma.productImage.create()` для кожного — позиція = `_N` суфікс з імені файлу (без суфікса = position 1).

Якщо clear для конкретного товару впав з помилкою — upload для цього товару пропускається (старі фото лишаються intact). Інші товари обробляються незалежно.

## Перевірка результату

Після успішного завантаження:

1. Відкрити будь-яку product page на сайті — має показуватись нова галерея.
2. Перевірити `next/image` оптимізація працює — відкрити DevTools Network, зображення повинні бути завантажені через `_next/image?url=...`.
3. Якщо CDN cache агресивний — `Ctrl+F5` обходить.

Якщо щось не так — `--replace` ідемпотентний, можна запускати повторно з виправленої trimmed папки.

## Опційні флаги для `upload-photos.ts`

| Flag                  | Default | Опис                                                      |
| --------------------- | ------- | --------------------------------------------------------- |
| `--dry-run`           | off     | НЕ писати у Storage/DB, тільки аналіз                     |
| `--skip-existing`     | off     | пропустити товари з ≥1 фото (НЕ сумісно з `--replace`)    |
| `--replace`           | off     | видалити старі фото перед upload                          |
| `--max-per-product=N` | ∞       | cap після group/sort (defensively, бо Phase 1 уже зрізав) |
| `--concurrency=N`     | 5       | паралельність по товарах                                  |

## Очистка

Після успішного завантаження `2025-2026-named-trimmed/` можна видалити — це лише робоча копія. `2025-2026-named/` (оригінал) краще зберегти як master.
