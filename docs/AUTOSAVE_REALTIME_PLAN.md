# План: наскрізне автозбереження чернетки в реальному часі

Статус: **у роботі.** Гілка: `claude/bag-repackaging-doc-analysis-iavsyu` (від свіжого `main`).

## 0. Мета (вимога user)

Жодна раптова перерва (закрита вкладка, втрата світла, падіння сервера, чищення
браузера, інший пристрій) **не повинна знищувати прогрес**. Усе введене
зберігається в реальному часі як чернетка. Стосується **ВСІХ документів без
винятку**, а також **довідників і карток** (клієнт/товар/лот).

## 1. Рішення user (зафіксовано)

- Нові документи автоматично зберігаються в базу як **чернетка** й **видимі в
  списку** з бейджем «Чернетка»; порожні/покинуті чернетки авто-прибираються
  через **14 днів**.
- Довідники й картки — **автозбереження одразу** (без кнопки «Зберегти»), плюс
  захист незбереженого вводу.
- Розгортання — **усе разом**, одним великим пакетом (один деплой).

## 2. Архітектура — дворівневий захист

### Рівень 1 — миттєва локальна копія (localStorage)

На кожну зміну (debounce ~500 мс) уся форма серіалізується в
`localStorage` за ключем `ltex:draft:<docType>:<id|"new">`. Рятує від закритої
вкладки/зависання браузера **навіть коли сервер недоступний**. При відкритті
форми — якщо локальна копія новіша за серверну → банер «Відновити незбережене?».

### Рівень 2 — жива чернетка в базі (debounced server save)

Debounce ~2 с тиші + **flush на `visibilitychange`(hidden)/`beforeunload`** →
чернетка пишеться в БД (`status="draft"`). Для нового документа перший запис
**створює draft-рядок** (POST) → повертає `id` → URL міняється на `/.../[id]`
через `window.history.replaceState` (без remount форми) → refresh відкриває
чернетку з БД. Наступні записи — PATCH цього draft. Це джерело правди; переживає
втрату світла/чищення браузера/інший пристрій.

**Синхронізація після падіння сервера:** поки сервер недоступний, тримається
localStorage; коли зв'язок повертається — наступний autosave дописує в БД.

### Індикатор

Спільний `<AutosaveStatus>`: «Збережено о HH:MM:SS» / «Збереження…» /
«Немає зв'язку — локальна копія в безпеці». На кожній формі/картці.

### Послаблена чернеткова валідація (критично)

Зараз навіть чернетковий POST вимагає `customerId.min(1)`, `items.min(1)` тощо.
Для autosave «з першого символу» кожен документ отримує **draft-режим**: усі поля
опційні, у БД лягає будь-що. Повна перевірка — лише при **«Провести»** (post).
Патерн: `draftMode` прапорець у endpoint → окрема relaxed-Zod-схема
(`<doc>DraftSchema` = strict-схема з `.partial()`/optional).

## 3. Спільна основа (Phase 0 — базис для всіх)

Нові файли (`apps/store/lib/autosave/` + shared component):

- **`useDocumentAutosave`** — для документів (дворівневий). API:
  ```ts
  const a = useDocumentAutosave({
    docType, // "sale" | "order" | ... — ключ localStorage + list
    existingId, // undefined для new
    data, // серіалізований стан форми
    enabled, // false для posted/archived (заблоковані)
    createDraft, // async (data) => id   (POST draft)
    updateDraft, // async (id, data) => void (PATCH draft)
    onIdAssigned, // (id) => history.replaceState(`/.../[id]`)
  });
  // a.status: "idle"|"saving"|"saved"|"offline"; a.savedAt; a.draftId;
  // a.restorePrompt; a.restore(); a.dismissLocal(); a.clearAll() (після post)
  ```
- **`useRecordAutosave`** — для карток/довідників (одразу зберігає зміну поля;
  debounce ~800 мс; localStorage-бекап; той самий `<AutosaveStatus>`).
- **`<AutosaveStatus status savedAt />`** — індикатор (shared UI).
- **`local-draft.ts`** — чисті хелпери localStorage (read/write/clear + `savedAt`).
- **Очищення покинутих чернеток:** `lib/autosave/cleanup-drafts.ts`
  (`deleteAbandonedDrafts(olderThanDays=14)` — для кожної doc-моделі:
  `status="draft"` AND `updatedAt < now-14d` AND «порожня» (немає рядків/ключових
  полів)) + cron-роут `app/api/cron/cleanup-drafts/route.ts` (auth `CRON_SECRET`,
  як інші крони). Windows-задача — раз/день.

## 4. Обсяг покриття (з інвентаря)

### A. Документи (10 форм-компонентів; stock-doc = 8 підвидів, bank-payment = 2)

| Форма                | Компонент                                          | Draft-режим потрібен                                  |
| -------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Замовлення           | `orders/new/_components/order-form.tsx`            | ✅ relaxed `orderDraftSchema`                         |
| Реалізація           | `sales/new/_components/sale-form.tsx`              | ✅ **PILOT**                                          |
| Оплата/Касовий ордер | `payments/new/_components/payment-form.tsx`        | ✅ (модель default `posted` → додати draft-шлях)      |
| Маршрутний лист      | `routes/[id]/_components/route-sheet-form.tsx`     | секційні PATCH — localStorage + автозбереження секцій |
| Поступлення          | `receivings/_components/receiving-form.tsx`        | мігрувати з localStorage-only → дворівневий           |
| Складські (×8)       | `stock-documents/_components/stock-doc-form.tsx`   | ✅ relaxed                                            |
| Зміна стану мішка    | `bag-state-changes/_components/bag-state-form.tsx` | ✅ relaxed                                            |
| Банк-платежі (×2)    | `_components/treasury/bank-payment-form.tsx`       | ✅ relaxed                                            |
| Переміщення каси     | `_components/treasury/cash-transfer-form.tsx`      | ✅ relaxed                                            |
| Нагадування          | `reminders/_components/reminder-create-form.tsx`   | localStorage (створення inline)                       |

### B. Довідники (~12 редакторів) — `useRecordAutosave` (авто-збереження рядка)

`dictionaries/[type]/_components/dictionary-editor.tsx` (+ `simple-dict-actions`),
bank-accounts, cash-flow-articles, cities, regions(+region-agents), units,
trade-agents, categories, price-types, message-templates, admin/users.
⚠️ Замінити реліктовий `window.confirm` (dictionary-editor.tsx:82) на портальний
діалог (еталон `use-doc-mark-deletion.tsx`).

### C. Картки (~10 секцій) — `useRecordAutosave`

Картка клієнта: реквізити / ключові слова / контактні особи / телефони /
месенджери / маршрути / банк-рахунки. Створення клієнта (`create-client-form`).
Створення товару (`product-create-form`, server action). Картка лоту
(`lot-card-modal`).

## 5. Фази виконання

- **Phase 0 (foundation, першою):** спільні хуки + `<AutosaveStatus>` + cleanup
  cron + PILOT-інтеграція **Реалізації** (relaxed schema + endpoint draftMode +
  autosave wiring + URL replace + list-бейдж) + тести + `next build` зелений.
- **Phase 1 (документи):** решта 9 документів за патерном пілота (паралельні
  воркери).
- **Phase 2 (довідники):** `useRecordAutosave` в усі редактори + заміна
  `window.confirm`.
- **Phase 3 (картки):** секції картки клієнта + товар/лот.
- **Integrate → `next build` → повний vitest → деплой** (один пакет).

## 6. Інваріанти / застереження

- **Заблоковані документи** (`posted`/`archived`/`completed`) autosave НЕ чіпає
  (лише перегляд).
- **`next build` — обов'язкова перевірка** щоразу (route-валідація ловить те, що
  `tsc`/vitest не бачать — урок з bag-state).
- **Грошові документи**: autosave пише лише чернетку (`status="draft"`) — рухи
  боргу/ДДС/складу НЕ зачіпаються (вони лише при «Провести»). Тобто autosave
  безпечний для обліку.
- Портальні inline-діалоги (не `window.confirm` — блокується в iframe-вкладках).
- Draft-рядки в списках — з бейджем «Чернетка», фільтр за замовчуванням показує їх
  власнику.
