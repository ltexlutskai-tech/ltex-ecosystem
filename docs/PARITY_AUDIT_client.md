# Parity Audit — Client Card (Картка клієнта)

**Date:** 2026-06-10  
**Sources read:**

- `docs/1c-export-mobile/Central/Catalogs/Контрагенты.xml` — full L-TEX-extended schema (2905 lines, all attributes + tabular sections)
- `docs/1c-export-mobile/Central/CommonModules/ОбменАРМ/Ext/Module.bsl` — `ДобавитьСправочникКонтрагентов` query (lines 1011–1210) shows exactly which fields are exchanged with the mobile agent
- `packages/db/prisma/schema.prisma` — `MgrClient` + all child models
- `apps/store/app/manager/(workstation)/customers/[id]/_components/*` — all tab components + types
- `apps/store/app/manager/(workstation)/customers/[id]/_lib/load-client.ts` — data loading

Legend: ✓ = both sides / ⚠️ GAP = 1С has it, we don't / ➕ EXTRA = we have it, 1С doesn't

---

## Tab 1 — Реквізити (Scalar fields on the Контрагент record)

| Status | 1С реквізит                                                        | Our field / UI label                                                       | Notes                                                                                                               |
| ------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ✓      | `Наименование` (Description / name)                                | `MgrClient.name` / "Найменування"                                          | Shown, editable                                                                                                     |
| ✓      | `НаименованиеТТ`                                                   | `MgrClient.tradePointName` / "Торгова точка"                               | Shown, editable                                                                                                     |
| ✓      | `НомерТелефона` (primary)                                          | `MgrClient.phonePrimary` / phones section                                  | Shown via ClientPhonesSection                                                                                       |
| ✓      | `ДополнительныеНомераТелефонов[]` (tabular: Номер + ВидМесенджера) | `MgrClientPhone[]`                                                         | Shown, CRUD editable with messenger label                                                                           |
| ✓      | `Город`                                                            | `MgrClient.city` / "Місто"                                                 | FK to Справочник.Города; we store free text                                                                         |
| ✓      | `Область`                                                          | `MgrClient.region` / "Область"                                             | FK to Справочник.Области; we store free text                                                                        |
| ✓      | `Улица`                                                            | `MgrClient.street` / "Вулиця"                                              | Shown, editable                                                                                                     |
| ✓      | `Дом`                                                              | `MgrClient.house` / "Будинок"                                              | Shown, editable                                                                                                     |
| ✓      | `НомерВідділенняНП`                                                | `MgrClient.novaPoshtaBranch` / "Відділення НП"                             | Shown as link, editable                                                                                             |
| ✓      | `СсылкаНаСайт`                                                     | `MgrClient.websiteUrl` / "Сайт"                                            | Shown as link, editable                                                                                             |
| ✓      | `Геолокация`                                                       | `MgrClient.geolocation` / "Геолокація"                                     | Shown as Maps link, editable                                                                                        |
| ✓      | `ОбъмЗаМесяц`                                                      | `MgrClient.monthlyVolume` / "Обсяг за місяць"                              | Shown (kg), editable                                                                                                |
| ✓      | `СтатусКонтрагента`                                                | `MgrClient.statusGeneralId` → `MgrClientStatus` / "Статус"                 | Shown, editable select                                                                                              |
| ✓      | `ОперативныйСтатусКонтрагента`                                     | `MgrClient.statusOperationalId` → `MgrClientStatus` / "Оперативний статус" | Shown, editable select                                                                                              |
| ✓      | `КодАсортимета` (enum КодыАсортимета)                              | `MgrClient.primaryAssortmentId` → `MgrAssortmentCode` / "Асортимент"       | Shown, editable                                                                                                     |
| ✓      | `КатегорияТТ`                                                      | `MgrClient.categoryTTId` → `MgrCategoryTT` / "Категорія ТТ"                | Shown, editable                                                                                                     |
| ✓      | `СпособДоставки`                                                   | `MgrClient.deliveryMethodId` → `MgrDeliveryMethod` / "Спосіб доставки"     | Shown, editable                                                                                                     |
| ✓      | `КаналПошуку`                                                      | `MgrClient.searchChannelId` → `MgrSearchChannel` / "Канал пошуку"          | Shown, editable                                                                                                     |
| ✓      | `ТорговыйАгент`                                                    | `MgrClient.agentUserId` → `User` / "Торговий агент"                        | Shown, editable (admin-only)                                                                                        |
| ✓      | `КоличествоДнейОтПоследнейПокупки`                                 | `MgrClient.daysSinceLastPurchase` / shown in list                          | Shown in client list; **not on card Реквізити**                                                                     |
| ✓      | `ДатаПоследнейПокупки`                                             | `MgrClient.lastPurchaseAt` / shown in list                                 | Shown in client list; **not on card Реквізити**                                                                     |
| ✓      | `ДатаСоздания`                                                     | `MgrClient.createdAt` / "Створений"                                        | Shown on card                                                                                                       |
| ✓      | `ДатаОновлення`                                                    | `MgrClient.lastSyncedAt` / "Оновлено з 1С"                                 | Shown on card                                                                                                       |
| ✓      | `Маршрут` (single FK)                                              | `MgrClient.primaryRouteId` / shown as primary                              | Shown in routes section                                                                                             |
| ✓      | Debt + overdue debt                                                | `MgrClient.debt` / `MgrClient.overdueDebt`                                 | Via `ЗаповнитиБоргиКонтрагентів` in BSL                                                                             |
| ✓      | `viberContact` (custom our field)                                  | `MgrClient.viberContact` / "Контакт Viber"                                 | Shown, editable                                                                                                     |
| ✓      | `sessionRemainder`                                                 | `MgrClient.sessionRemainder` / "Залишок сесії"                             | Shown, editable                                                                                                     |
| ✓      | License date                                                       | `MgrClient.licenseExpiresAt` / "Ліцензія дійсна до"                        | Shown, editable                                                                                                     |
| ⚠️ GAP | `ЕМейл` (email field, xs:string len 200)                           | **Not stored**                                                             | 1С has a dedicated email field on Контрагент. We have no email column on MgrClient.                                 |
| ⚠️ GAP | `Комментарий` (free-text comment on the Контрагент record itself)  | **Not stored separately**                                                  | 1С has a Комментарий attribute. We have timeline/comments but no dedicated scalar comment on the card.              |
| ⚠️ GAP | `НаименованиеПолное` (full legal name, xs:string unlimited)        | **Not stored**                                                             | Used for юр.особи. We only have `name`.                                                                             |
| ⚠️ GAP | `ЮрФизЛицо` (enum: ЮрЛицо / ФизЛицо)                               | **Not stored**                                                             | Determines legal entity type; affects invoice generation.                                                           |
| ⚠️ GAP | `ИНН` (taxpayer ID, 12 chars)                                      | **Not stored**                                                             | Required for legal-entity clients and tax documents.                                                                |
| ⚠️ GAP | `КодПоЕДРПОУ` (ЄДРПОУ code, 12 chars)                              | **Not stored**                                                             | Required for Ukrainian legal entities.                                                                              |
| ⚠️ GAP | `ОсновнойМенеджерПокупателя` (FK Пользователи)                     | **Not stored**                                                             | This is the 1С-side "primary manager" (different from our `agentUserId`). Could diverge during sync.                |
| ⚠️ GAP | `РасписаниеРаботыСтрокой` (working hours, xs:string)               | **Not stored**                                                             | Working schedule string for the trade point.                                                                        |
| ⚠️ GAP | `ДокументУдостоверяющийЛичность` (ID document, xs:string)          | **Not stored**                                                             | Identity document reference for physical persons.                                                                   |
| ⚠️ GAP | `ДополнительноеОписание` (additional description)                  | **Not stored**                                                             | Additional description field (not same as Комментарий).                                                             |
| ⚠️ GAP | `ТовДолг` / `ТовПростроченийДолг`                                  | `MgrClient.tovDebt` / `MgrClient.tovOverdueDebt`                           | ✓ Stored BUT **not computed from our data** — manually synced scalar, not derived from our Sale/Order documents.    |
| ⚠️ GAP | `isOwn` / `Власний` flag origin                                    | `MgrClient.isOwn`                                                          | ✓ Stored. In 1С this comes from the join condition `ТорговыйАгент = &ТорговийАгент`. Our field is a manual boolean. |

---

## Tab 2 — Асортимент (Tabular section `Асортимент`)

| Status | 1С                                                        | Our side                                              | Notes                                                                           |
| ------ | --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| ✓      | `Асортимент[].Артикул` (article/keywords, up to 64 chars) | `MgrClientAssortmentItem.productCode` + `productName` | Shown in Assortment tab, editable                                               |
| ✓      | Manual vs auto flag (`РучнаяЗапись`)                      | `MgrClientAssortmentItem.notDirectInput`              | Stored + shown as chip                                                          |
| ⚠️ GAP | `lastOrderedAt` date per assortment item                  | `MgrClientAssortmentItem.lastOrderedAt`               | ✓ We **have the column** but it is never populated (no import logic exists yet) |

---

## Tab 3 — Презентації (Tabular section `АсортиментПрезентацій`)

| Status | 1С                                                          | Our side                                                              | Notes                                                            |
| ------ | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| ✓      | `АсортиментПрезентацій[].Артикул`                           | `MgrClientPresentationItem.productCode` + `productName`               | Stored, shown read-only                                          |
| ✓      | Manual vs auto flag                                         | `MgrClientPresentationItem.notDirectInput`                            | Stored                                                           |
| ⚠️ GAP | Last presented date                                         | `MgrClientPresentationItem.lastPresentedAt`                           | Column exists but never populated                                |
| ⚠️ GAP | Full presentation history with date + manager + items shown | `ClientPresentationHistoryTab` → `<UnderConstruction session="M1.6">` | **Not implemented** — the whole "Іст. презентацій" tab is a stub |

---

## Tab 4 — Соц мережі (Tabular section `СоцМережі`)

| Status   | 1С                                       | Our side                                                                                                                       | Notes                                    |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| ✓        | `СоцМережі[].Мережа` (enum ВидиСоцМереж) | `MgrClientMessenger.network`                                                                                                   | Stored                                   |
| ✓        | `СоцМережі[].Посилання`                  | `MgrClientMessenger.handle` + `url`                                                                                            | Stored, shown with deep links            |
| ✓        | `СоцМережі[].ПосиланняВБраузері`         | `MgrClientMessenger.browserUrl`                                                                                                | Stored                                   |
| ✓        | `СоцМережі[].Коментар`                   | `MgrClientMessenger.comment`                                                                                                   | Stored                                   |
| ➕ EXTRA | —                                        | `client-social-tab.tsx` shows full CRUD with brand icons (Viber/Telegram/WhatsApp/Instagram/TikTok/YouTube/Facebook/Pinterest) | We have 9 networks vs 1С enum; richer UI |

---

## Tab 5 — Банківські рахунки (Tabular section `БанковскиеСчетаДляОплаты` → `Catalog.БанковскиеСчета`)

| Status | 1С                                                                              | Our side                                                | Notes                                                                          |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ✓      | Bank account reference (FK)                                                     | `MgrClientBankAccount.accountNumber`, `bankName`, `mfo` | Shown read-only in Реквізити (primary non-hidden account), full list available |
| ✓      | IBAN copy action                                                                | Copy-button in `ClientBankAccountRow`                   | ✓                                                                              |
| ⚠️ GAP | Full `Catalog.БанковскиеСчета` details: bank MFO, full name, SWIFT, contract FK | We store `accountNumber + bankName + mfo` only          | Missing SWIFT, no sub-catalog for banks                                        |
| ⚠️ GAP | `isHidden` (our extra flag) is not a 1С concept                                 | `MgrClientBankAccount.isHidden`                         | ➕ EXTRA — our convenience field                                               |

---

## Tab 6 — Маршрути (Tabular section `Маршруты`)

| Status   | 1С                                               | Our side                                | Notes                                                                       |
| -------- | ------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------- |
| ✓        | `Маршруты[].Маршрут` (FK to Справочник.Маршруты) | `MgrClientRouteAssignment` + `MgrRoute` | Shown, CRUD editable                                                        |
| ✓        | `Маршрут` single primary route FK on Контрагент  | `MgrClient.primaryRouteId`              | Shown as primary in routes section                                          |
| ➕ EXTRA | —                                                | `sortOrder` on route assignment         | We have ordering; 1С tabular section has LineNumber but no explicit reorder |

---

## Tab 7 — Нагадування

| Status   | 1С                                        | Our side                                                                    | Notes                                  |
| -------- | ----------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| ✓        | Reminder list per client, overdue counter | `MgrReminder[]` filtered by `clientId`                                      | Shown in Нагадування tab; badge on tab |
| ✓        | Manual reminders (body, date, repeat)     | `MgrReminder` with `periodicity`, `remindAt`, `body`                        | Full CRUD                              |
| ✓        | Auto reminders (video / bron expiry)      | `MgrReminder.source = auto_video / auto_bron`                               | Generated by cron                      |
| ➕ EXTRA | —                                         | Product reminder type (`isProductReminder`, `MgrReminderItem[]`)            | Richer than 1С basic reminders         |
| ➕ EXTRA | —                                         | Snooze action (`snoozedUntilAt`), action types (continue_bron, viber_video) | 1С doesn't have this                   |

---

## Tab 8 — Замовлення (Orders)

| Status | 1С                                              | Our side                                                  | Notes                                                      |
| ------ | ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| ✓      | Orders list per client (read-only tab)          | `ClientOrdersTab` → real data via `/clients/[id]/orders`  | Shown, paginated                                           |
| ✓      | Create new order button                         | `OrderCreateButton`                                       | Links to `/manager/orders/new?clientId=...`                |
| ✓      | Order statuses, totals                          | Via `Order` model                                         | Shown                                                      |
| ⚠️ GAP | Closed orders tab / "Закриття старих замовлень" | `/manager/closures` (separate screen, not in client card) | Available separately, not embedded in client card as a tab |

---

## Tab 9 — Історія продаж (`ClientSalesHistoryTab`)

| Status | 1С                                                                                | Our side                             | Notes                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ⚠️ GAP | Sales history: list of реалізації linked to this client (date, sum, items, agent) | `<UnderConstruction session="M1.4">` | **Not implemented** — stub. 1С shows all `Документ.РеализацияТоваровУслуг` for this Контрагент. Our `Sale` model has `customerId` but there is no tab rendering it per-client. |
| ⚠️ GAP | Aggregate "Ob'єм за місяць" computed from sales                                   | `MgrClient.monthlyVolume`            | Stored as a synced scalar, not computed live from our Sale documents                                                                                                           |

---

## Tab 10 — Історія / Timeline

| Status   | 1С                                                 | Our side                                                    | Notes                                                                      |
| -------- | -------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| ✓        | Manual comments on client history                  | `MgrClientTimelineEntry.kind="comment"`                     | Full CRUD with edit/delete                                                 |
| ✓        | Auto-entries for orders/sales/payments/bookings    | `recordClientEventSafe` in `lib/manager/client-timeline.ts` | Fire-and-forget auto-entries                                               |
| ✓        | Pagination                                         | 50/page via API                                             | ✓                                                                          |
| ➕ EXTRA | —                                                  | `kind` enum with 10+ event types, `metadata` JSON           | Richer than 1С basic timeline                                              |
| ⚠️ GAP   | Historical timeline from 1С (events before import) | **No data**                                                 | Timeline is empty for all clients until 1С historical import (Пріоритет 2) |

---

## Tab 11 — Ключові слова (EXTRA tab)

| Status   | 1С                                                                                                                           | Our side                                          | Notes                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| ➕ EXTRA | 1С `Асортимент[].Артикул` header says "Артикул / Ключові слова" — so keywords are embedded in the assortment tabular section | `MgrClient.keywords` — separate scalar text field | We extracted keywords into a dedicated searchable field; also drives list search |

---

## Tab 12 — Viber (partial stub)

| Status | 1С                                               | Our side                                              | Notes                                                                                |
| ------ | ------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ✓      | Viber contact deep-links                         | `ClientViberTab` shows all phone-based viber:// links | Works                                                                                |
| ✓      | `isViberLinked` flag                             | `MgrClient.isViberLinked`                             | Shown                                                                                |
| ⚠️ GAP | Viber conversation inbox embedded in client card | `ClientViberTab` has stub text "зробимо у M1.8"       | Chat inbox exists at `/manager/chat` globally but is NOT embedded in the client card |

---

## Tab 13 — Іст. презентацій (stub)

| Status | 1С                                                                                | Our side                             | Notes               |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------ | ------------------- |
| ⚠️ GAP | Presentation history: when each product was shown to the client, by which manager | `<UnderConstruction session="M1.6">` | **Not implemented** |

---

## Fields in 1С NOT exchanged with mobile (internal only, lower priority)

These are on the `Контрагенты` catalog but are NOT included in `ДобавитьСправочникКонтрагентов` query — internal accounting/legal fields:

| 1С реквізит                                                            | Category            | Priority                        |
| ---------------------------------------------------------------------- | ------------------- | ------------------------------- |
| `ОсновнойДоговорКонтрагента` (main contract FK)                        | Legal/accounting    | Low                             |
| `ДоговорДляНеплановыхПродаж`                                           | Legal/accounting    | Low                             |
| `ОсновнойБанковскийСчет` (FK, different from БанковскиеСчетаДляОплаты) | Accounting          | Low                             |
| `НомерСвидетельства` (VAT certificate number)                          | Tax/legal           | Low                             |
| `НеЯвляетсяРезидентом` (non-resident flag)                             | Tax/legal           | Low                             |
| `ГруппаДоступаККонтрагенту` (access group)                             | 1С access control   | N/A                             |
| `ОсновнойВидДеятельности` + `ВидыДеятельности[]`                       | CRM classification  | Low                             |
| `МенеджерыПокупателя[]` (multiple managers table)                      | CRM                 | Medium                          |
| `ИсточникИнформацииПриОбращении`                                       | CRM                 | Low (= KaналПошуку equivalent?) |
| `Торговый Агент` — tabular `МенеджерыПокупателя[]`                     | Multi-agent support | Medium                          |
| `ОсновноеКонтактноеЛицо`                                               | Contact person      | Low                             |
| `ДополнятьНаименованиеАдресДаннымиГоловногоКонтрагентаВНН`             | Tax documents       | N/A                             |
| `ГоловнойКонтрагент` (parent contractor hierarchy)                     | Hierarchy           | Medium                          |
| `СрокВыполненияЗаказаПоставщиком`                                      | Supplier-side       | N/A                             |
| `КодФилиала` / `ИспользоватьЭДО1СЗвит`                                 | EDO/tax             | N/A                             |
| `МенеджерыПокупателя[]` (multiple assigned managers)                   | CRM                 | Medium                          |

---

## Summary matrix by tab

| Tab                                                                              | Status                          |
| -------------------------------------------------------------------------------- | ------------------------------- |
| Реквізити — core address/contact fields                                          | ✓                               |
| Реквізити — legal/tax fields (ІНН, ЄДРПОУ, ЮрФізЛицо, НаименованиеПолное, ЕМейл) | ⚠️ GAP                          |
| Реквізити — comment/description fields (Комментарий, ДополнительноеОписание)     | ⚠️ GAP                          |
| Асортимент                                                                       | ✓ (lastOrderedAt not populated) |
| Презентації (current assortment shown to client)                                 | ✓                               |
| Іст. презентацій (history of presentations)                                      | ⚠️ GAP (stub)                   |
| Соц мережі / месенджери                                                          | ✓                               |
| Банківські рахунки                                                               | ✓ (partial - no SWIFT)          |
| Маршрути                                                                         | ✓                               |
| Нагадування                                                                      | ✓ (richer than 1С)              |
| Замовлення tab                                                                   | ✓                               |
| Історія продаж tab                                                               | ⚠️ GAP (stub)                   |
| Історія / Timeline                                                               | ✓ (no historical 1С data yet)   |
| Ключові слова                                                                    | ➕ EXTRA                        |
| Viber                                                                            | ⚠️ GAP (not embedded in card)   |
| Multi-manager assignment                                                         | ⚠️ GAP                          |
| Contractor hierarchy (ГоловнойКонтрагент)                                        | ⚠️ GAP                          |

---

## Top gaps, prioritized

1. **Реквізити — Історія продаж tab is a stub** (`ClientSalesHistoryTab` → UnderConstruction). 1С shows full `РеализацияТоваровУслуг` list per client. Our `Sale` model has `customerId` but no rendering per-client. This is a frequently-used tab in daily workflow. **Priority: HIGH.**

2. **Реквізити — ЕМейл поле відсутнє** (`ЕМейл` xs:string 200 на Контрагент). Менеджери вводять email клієнта в 1С — у нас немає цього поля ні в `MgrClient`, ні у формі створення. При імпорті даних з 1С (Пріоритет 2) email буде загублено. **Priority: HIGH — потрібно поле + міграція перед імпортом.**

3. **ЮрФізЛицо + ІНН + КодПоЕДРПОУ + НаименованиеПолное** — чотири поля для юридичних осіб. У L-TEX є корпоративні клієнти (ТОВ, ФОП). При виставленні рахунків/накладних потрібні ЄДРПОУ і повна назва. Жоден з чотирьох полів не зберігається. **Priority: HIGH — особливо при активації блоку Реалізація для юр.осіб.**

4. **Комментарий на картці** — scalar free-text comment (`Комментарий` Attribute на Контрагент). У нас є Timeline, але в 1С є окремий короткий коментар, що відображається прямо у шапці картки. При імпорті цей текст не потрапить нікуди. **Priority: MEDIUM.**

5. **МенеджерыПокупателя[] (tabular) — множинне призначення менеджерів.** 1С підтримує табличну секцію менеджерів (кілька менеджерів на одного клієнта). У нас є тільки `ClientAssignment` (для видимості чужих) і `agentUserId` (один основний). При роботі з великими клієнтами через кількох менеджерів — дані втрачаються. **Priority: MEDIUM.**

6. **Іст. презентацій tab — не реалізований** (stub M1.6). Менеджери активно використовують "що показували цьому клієнту раніше і коли". Таблиця `MgrClientPresentationItem` є, але history tab + `lastPresentedAt` population відсутні. **Priority: MEDIUM.**

7. **ГоловнойКонтрагент (parent hierarchy)** — у L-TEX є клієнти-мережі з дочірніми ТТ. 1С підтримує дворівневу ієрархію (Catalog.Hierarchical=true). У нас немає `parentClientId`. При імпорті мережевих клієнтів ієрархія буде втрачена. **Priority: MEDIUM — важливо для імпорту.**

8. **Viber inbox не вбудований в картку клієнта.** У 1С вкладка Viber дозволяла відповідати з картки. Наш `/manager/chat` — глобальний inbox, не прив'язаний до вкладки картки. Менеджер мусить виходити з картки для роботи з чатом. **Priority: MEDIUM.**

9. **daysSinceLastPurchase / lastPurchaseAt — на картці не відображаються.** Обидва поля є в `MgrClient` і у списку клієнтів, але на самій картці клієнта (`ClientRequisitesView`) — відсутні. У 1С ці дані показуються на картці і є ключовими для оцінки активності. **Priority: LOW-MEDIUM (quick fix — додати рядки у view).**

10. **РасписаниеРаботыСтрокой (hours of operation)** — рядок з розкладом роботи ТТ. Корисно для маршрутних листів (знати коли клієнт відкритий). Не зберігається. **Priority: LOW.**

11. **ДополнительноеОписание** — другий вільний текст (додатковий опис, окремо від Комментарий). Не зберігається. **Priority: LOW.**

12. **lastOrderedAt per assortment item** — `MgrClientAssortmentItem.lastOrderedAt` колонка є, але ніколи не заповнюється (немає логіки populate з наших Order документів). **Priority: LOW — автоматично вирішиться при повному historical import.**
