# 1C Export — Reference (Read-only)

Скопійовано з [catalog-full repo](https://github.com/ltexlutskai-tech/catalog-full/tree/main/1c-export) (commit `910a997e0303e2eccbd8136761c21ce3b8d97ccc`) для прив'язки наших sync API до реального формату 1С.

**Не редагувати тут.** Це read-only reference. Коли 1С міняє формат — оновлюй у catalog-full і копіюй сюди.

## Структура

- `CommonModules/` — модулі-stubs обміну з сайтом, АРМ, Android (без BSL-коду — тіла модулів ще не написані)
- `ExchangePlans/` — плани обміну з конкретними `Content.xml` (мапа об'єктів) та `ObjectModule.bsl` (boilerplate)

## Ключові висновки (для S66 spec)

### 1. План обміну "Товари" (`ExchangePlans/ОбменССайтомТоварами/Ext/Content.xml`)

```xml
<Item>
  <Metadata>Catalog.Номенклатура</Metadata>
  <AutoRecord>Allow</AutoRecord>
</Item>
<Item>
  <Metadata>Catalog.ХранилищеДополнительнойИнформации</Metadata>
  <AutoRecord>Deny</AutoRecord>
</Item>
```

Sync-аться:

- **`Catalog.Номенклатура`** = наш `Product` (mapping: 1С `Код` → web `code1C`, `Наименование` → `name`, `Артикул` → `articleCode`, etc.)
- **`Catalog.ХранилищеДополнительнойИнформации`** = додаткова інформація (зображення?). AutoRecord=Deny — не пушиться автоматично, тільки через manual triggers.

⚠️ **Категорії, ціни, лоти, стрихкоди — НЕ у плані обміну**. Потрібно або:

- (A) Додати їх у Content.xml на 1С стороні (рекомендовано)
- (B) Проштовхувати у бічних procedures, які 1С-розробник напише поза планом

### 2. План обміну "Замовлення" (`ExchangePlans/ОбменССайтомЗаказами/Ext/Content.xml`)

```xml
<Item>
  <Metadata>Document.ЗаказПокупателя</Metadata>
  <AutoRecord>Allow</AutoRecord>
</Item>
```

Sync-ається тільки **`Document.ЗаказПокупателя`** (Заявка покупця).

⚠️ **План обміну двосторонній!** 1С чекає що сайт може як **отримувати** замовлення (через GET `/api/sync/orders/export` ✅ уже є), так і **відправляти 1С-створені** замовлення (наприклад менеджер створив замовлення у 1С з телефонної заявки, і хоче побачити його в адмінці сайту). Поточний sync API цього **не підтримує** — потрібен новий POST `/api/sync/orders/import` endpoint, якщо такий use case є в L-TEX.

### 3. Логіки обміну ще нема — лише boilerplate

- `CommonModules/ПроцедурыОбменаССайтом.xml` — declaration пустий, **код не написаний**. Файл 22 рядки = пустий stub.
- `ExchangePlans/ОбменССайтом*/Ext/ObjectModule.bsl` — стандартний boilerplate (повідомлення про перезапуск після створення вузла), без логіки експорту даних.
- Жодного `.bsl` файлу з реальним експортом немає у репо.

Це означає 1С-розробник реалізовуватиме код **з нуля**. Наш `docs/1C_SYNC_GUIDE.md` (S66) описує контракт endpoints — розробник прочитає і напише BSL який POST-ить JSON на наші endpoints через `HTTPСоединение`/`WSПрокси`.

## Що НЕ скопійовано (поки не потрібно)

- Усі 49 категорій / 805 продуктів / їхні XML структури — це повна dump конфігурації, занадто велика. Якщо 1С-розробник попросить — скопіюємо `Catalogs/Номенклатура.xml` для бачення повного списку реквізитів.
- HTTPServices (ботів, Push-API) — не пов'язано з sync сайтом.
- DataProcessors / Reports — не пов'язано.

## Як використовується

`docs/SESSION_66_1C_SYNC_CATALOG.md` (worker spec) і `docs/1C_SYNC_GUIDE.md` (інтеграційна документація для 1С-розробника) посилаються на цей референс.

Коли 1С-розробник напише код у `ПроцедурыОбменаССайтом.Module.bsl` — оновіть копію у нашому репо для синхронізації.
