# 1C Export — Mobile Manager Reference (Read-only)

**Призначення:** повний дамп конфігурацій 1С які потрібні менеджерському треку (M1.x). Скопійовано з [catalog-full repo](https://github.com/ltexlutskai-tech/catalog-full/tree/main/1c-export) для прив'язки нашого manager-app коду до реального формату 1С.

**НЕ редагувати тут.** Це read-only reference. Оновлювати треба у `catalog-full`, потім re-copy сюди.

## Структура

```
docs/1c-export-mobile/
├── MobileAgent/         ← повний дамп MobileAgentLTEX v1.15.3 (~21 МБ)
│   ├── Catalogs/        — каталоги мобільного: Контрагенты, СкладыКонтрагентов,
│   │                      Номенклатура, ХарактеристикиНоменклатуры, КатегорииТТ,
│   │                      Города, Області, ТорговыеАгенты, Маршрути тощо
│   ├── Documents/       — Заказ, Реалізація, КассовыйОрдер, МаршрутныйЛист,
│   │                      Презентація, Возврат, Приход
│   ├── InformationRegisters/  — РегистрацияОбмена (черга), Кілометраж,
│   │                            ЦеныНоменклатуры, РаботаСКлиентом, Лог тощо
│   ├── AccumulationRegisters/ — ОстаткиТоваров, Продажи, ДенежныеСредства
│   ├── CommonModules/   — Общий (2459 рядків), Обмен_УправлениеОбменом,
│   │                      Обмен_АнализДанных, ViberОбновленияКлиент тощо
│   ├── CommonForms/     — ФормаОбмена, ФормаПодбораНоменклатуры,
│   │                      ФормаВводуПароля тощо
│   ├── DataProcessors/  — Оплата, Чат1с, Нагадування, ЗакрытиеСтарыхЗаказов
│   ├── Enums/           — Viber_Направление, СтатусыОплати тощо
│   └── Configuration.xml — метадані конфігурації
└── Central/             ← вибіркові частини центральної УТ (~9 МБ)
    ├── Catalogs/
    │   ├── Контрагенты/         — реквізити клієнта в ЦБ (мапа до мобільного)
    │   ├── СкладыКонтрагентов/  — склади доставки
    │   ├── КатегорииТТ/         — категорії торгових точок
    │   ├── СтатусыКонтрагентов/ — статуси клієнтів
    │   ├── ДоговорыКонтрагентов/ — договори (для боргів)
    │   ├── Города/              — довідник міст
    │   └── ТорговыеАгенты/      — менеджери (mapping ПарольВхода → менеджер)
    ├── WebServices/
    │   └── MobileExchange/      — SOAP-сервіс з 23 операціями
    │                              (ОбработатьПакетДанных, ВыгрузитьИзменения,
    │                              ОновитьОстаткиТаЦены, ЗабронюватиНоменклатуру тощо)
    ├── CommonModules/
    │   ├── ОбменАндроид/        — сервер-сайд логіка обміну з Mobile
    │   ├── ОбменАРМ/            — те саме для desktop ARM
    │   ├── ПроцедурыОбменаДанными/    — спільна логіка обмінів
    │   └── ПараметрыОбменаДанными/   — конфіг параметрів
    └── Documents/
        ├── ЗаказПокупателя/     — для M1.5 (orders)
        ├── РеализацияТоваровУслуг/  — для M1.6 (sales)
        ├── ПриходныйКассовыйОрдер/  — для M1.6 (payments)
        ├── РасходныйКассовыйОрдер/  — для M1.6 (cash out / change)
        └── ВозвратТоваровОтПокупателя/  — для M2.1 (returns)
```

## Як використовувати при написанні specs

| Розробляєш | Дивись |
|---|---|
| **M1.3 Клієнти** | `MobileAgent/Catalogs/Контрагенты/Ext/Form/ФормаЭлемента/Ext/Form.xml` (макет картки) + `Module.bsl` (логіка). `MobileAgent/Catalogs/СкладыКонтрагентов/`. Mapping → `Central/Catalogs/Контрагенты/` для дізнатись як ЦБ передає поля при обміні. Боргова логіка → `MobileAgent/CommonModules/Общий/Ext/Module.bsl` (функції `ОтриматиБорг`, `ОтриматиПросроченийБорг`). |
| **M1.4 Товари + ШК** | `MobileAgent/Catalogs/Номенклатура/`, `ХарактеристикиНоменклатуры/`, `Catalogs/Штрихкоды/` (якщо існує) + `CommonForms/ФормаПодбораНоменклатуры/Ext/Form/Module.bsl`. Ціни → `InformationRegisters/ЦеныНоменклатуры/`. |
| **M1.5 Замовлення** | `MobileAgent/Documents/Заказ/Ext/Form/ФормаДокумента/Ext/Form/Module.bsl` (як менеджер створює замовлення у 1С). Серверна сторона: `Central/Documents/ЗаказПокупателя/Ext/ObjectModule.bsl`. |
| **M1.6 Реалізація + Каса** | `MobileAgent/Documents/РеализацияТоваровУслуг/`, `КассовыйОрдер/` + `DataProcessors/Оплата/`. Mapping → `Central/Documents/ПриходныйКассовыйОрдер/` + `РасходныйКассовыйОрдер/`. |
| **M1.7 Маршрутний лист** | `MobileAgent/Documents/МаршрутныйЛист/` + `CommonForms/ФормаВводаКілометражу/`. |
| **M1.8 Чат** | `MobileAgent/DataProcessors/Чат1с/` + `InformationRegisters/{Входящие,Исходящие}Сообщения/`. |
| **M1.9 Нагадування + GPS** | `MobileAgent/DataProcessors/Нагадування/` + `InformationRegisters/РегистрацияКоординат/`, `Кілометраж/`. |
| **M1.10 Telegram bot** | Тут конфігурація 1С нічим не допоможе — Telegram bot уже існує (`services/telegram-bot/`). |
| **Гри SOAP** | `Central/WebServices/MobileExchange/Ext/Module.bsl` — повний код всіх 23 SOAP-операцій. Для написання нашого `services/manager-sync/` адаптера це must-read. |

## Що НЕ скопійовано (свідомо)

З `Центральна 1с/` (343 МБ повного) взято тільки потрібне для manager-app треку. **НЕ** включено:

- `Catalogs/Номенклатура/` повний (дублюється з `MobileAgent/`)
- `AccumulationRegisters/*` повний (тільки специфічні через `MobileAgent/`)
- `Reports/`, `ChartsOfCharacteristicTypes/`, `BusinessProcesses/` — не релевантні для менеджерського workflow
- `DocumentJournals/`, `ExchangePlans/` (тільки сайт-обмін у окремому `docs/1c-export/`)
- `HTTPServices/`, `Interfaces/`, `Styles/`, `StyleItems/` — UI рендеринг ЦБ, нам не треба
- `SessionParameters/`, `Roles/`, `EventSubscriptions/` — серверна сторона ЦБ, нам не критично

Якщо у майбутньому знадобиться щось ще з ЦБ — копіюємо selective з `catalog-full`.

## Версії

- **catalog-full commit:** дата clone — 2026-05-13
- **MobileAgentLTEX версія:** 1.15.3 (з `MobileAgent/Configuration.xml`)
- **ЦБ редакція:** УТ для України (точна редакція TBD, бачимо child об'єкти)

## Related

- `MOBILE_APP_ANALYSIS.md` (root репо, 3155 рядків) — high-level аудит цих файлів
- `docs/1c-export/` — окремий, тільки сайтовий обмін (не плутати з manager track)
- `docs/MANAGER_APP_STRATEGY.md` — наш план manager app
- `docs/M1_BACKLOG.md` — посесійний backlog
