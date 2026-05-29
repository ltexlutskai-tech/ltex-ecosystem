# 1С Web-Service Publication — інструкція для user

**Призначення:** Опублікувати web-сервіс `MobileExchange.1cws` з 1С Central
бази на тій же машині де живе наш Node (Windows Server, `new.ltex.com.ua`).
Усе локально (localhost), без firewall/VPN.

**Передумова:** 1С-конфіга вже містить визначення `WebService.MobileExchange`
з 24 методами (`docs/1c-export-mobile/Central/WebServices/MobileExchange.xml`).
Бізнес-логіка готова (`Central/CommonModules/ОбменАРМ`, 7635 рядків).

**Що ми зробимо:**

1. Перевіримо яка веб-платформа стоїть (Apache або IIS) — або встановимо
2. Опублікуємо web-сервіс через 1С Конфігуратор → Адміністрування →
   Публікація на веб-сервері
3. Перевіримо через `curl` що WSDL відповідає
4. (Пізніше, після Etap 2 готовий) — додамо нові JSON-обгортки + перепублікуємо

---

## 0. Передумова: який веб-сервер встановлений?

У PowerShell на сервері виконай:

```powershell
# Перевірка IIS
Get-Service -Name W3SVC -ErrorAction SilentlyContinue | Format-List Name, Status

# Перевірка Apache (якщо встановлений як служба)
Get-Service -Name "Apache*" -ErrorAction SilentlyContinue | Format-List Name, Status

# Перевірка процесів
Get-Process -Name httpd, w3wp -ErrorAction SilentlyContinue
```

**Очікувані результати:**

- **IIS:** Service `W3SVC` Running → у тебе стоїть IIS. Це найімовірніший
  варіант на Windows Server 2022.
- **Apache:** Якщо ні IIS, ні Apache — треба встановити. Рекомендую **Apache 2.4
  для 1С** (Apache Lounge build) бо 1С Конфігуратор найкраще з ним інтегрується.
  Скачати з https://www.apachelounge.com/download/ (vc17 build, x64).

> Якщо встановлюватимеш Apache — повідом мені (в новому повідомленні), я надам
> детальну інструкцію встановлення. Далі вважатиму що **IIS** уже стоїть (бо
> Windows Server 2022).

## 1. IIS: дозволити ASP.NET-розширення для 1С

1С публікує web-сервіси через `wsisapi.dll` (1С ISAPI extension). Він іде
у комплекті з 1С Платформою.

1. **Server Manager** → Manage → Add Roles and Features → Server Roles →
   **Web Server (IIS)** → Application Development → ✅ **ISAPI Extensions** +
   ✅ **ISAPI Filters**. Install. Restart не потрібен.
2. Перевір: `Get-WindowsFeature Web-ISAPI-*` — обидва `Installed`.

## 2. 1С Конфігуратор: публікація MobileExchange

> **Важливо:** Спочатку публікуй на **тест-копії** Central бази (вона у тебе є,
> підтверджено). Production — після успішного smoke-test.

1. Відкрий 1С Конфігуратор → **тест-копія Central база**.
2. Меню **Адміністрування → Публікація на веб-сервері…**
3. У діалозі:
   - **Ім'я (Name):** `ltex_test` (для production буде `ltex`)
   - **Веб-сервер:** Internet Information Services (вибрати зі списку)
   - **Каталог:** `C:\inetpub\wwwroot\ltex_test\` (для prod: `…\ltex\`)
     (1С створить каталог автоматично якщо не існує)
   - **Адреса:** `http://localhost/ltex_test`
   - **Розширення:** залиш як є
4. Перейди на вкладку **Веб-сервіси (Web services)**:
   - Знайди у списку `MobileExchange` → постав ✅
   - Виставити **Адреса (Alias):** `MobileExchange.1cws`
   - Можеш залишити інші web-сервіси як є (галочки на свій розсуд — якщо є
     інші)
5. Перейди на вкладку **Інші параметри (Other settings):**
   - ✅ **Публікувати HTTP-сервіси за замовчуванням** — лиши якщо вже є
   - **Перевірка прав:** обери авторизацію — для тест-копії можна
     **Anonymous** (для production — обов'язково
     **Basic Authentication** або краще **OS authentication**)
6. Натисни **Опублікувати**. 1С створить `default.vrd` + конфігурацію IIS.
   IIS перезапуститься автоматично.

### Можливі помилки

- **"Не удалось опубликовать веб-приложение"** — найчастіше нема прав. Запусти
  Конфігуратор **від Адміністратора** (Run as Admin).
- **"Не зарегистрировано расширение wsisapi.dll"** — 1С спробує зареєструвати
  саме. Якщо не вийде — вручну через `regsvr32`:
  ```powershell
  regsvr32 "C:\Program Files\1cv8\<version>\bin\wsisapi.dll"
  ```
  (Шлях залежить від встановленої версії 1С Платформи — глянь
  `C:\Program Files\1cv8\`.)

## 3. Перевірка публікації

У PowerShell на тому ж сервері:

```powershell
# WSDL має повернутись (XML з 30+ операцій)
curl.exe -s "http://localhost/ltex_test/ws/MobileExchange.1cws?wsdl" | Select-String "wsdl:operation" | Measure-Object

# Має бути 24 матча (стандартні методи). Після Етапу 2 — 30 (з 6 новими).
```

**Очікуваний вивід:** `Count: 24` (поточна публікація без наших JSON-wrappers).

Якщо отримуєш `<HTML>… 401 Unauthorized` — на IIS потрібно дозволити
анонімний доступ для нашого віртуального каталогу:

```powershell
# IIS Manager → ltex_test → Authentication → Enable Anonymous Authentication
# або через cmdline:
& "$env:windir\system32\inetsrv\appcmd.exe" set config "Default Web Site/ltex_test" /section:anonymousAuthentication /enabled:true
```

Якщо отримуєш `404 Not Found`:

```powershell
# Перевір що IIS бачить vrd-файл
ls C:\inetpub\wwwroot\ltex_test\
# Має бути default.vrd і web.config
```

## 4. Перевірка SOAP-виклику (smoke test одного існуючого методу)

Викликаємо `НачатьОбмен` (найпростіший — повертає JSON статусу авторизації).
Тут `ПарольВхода` має бути ВАЛІДНИМ паролем продавця у твоїй тест-базі. Якщо
не знаєш — у Конфігураторі → довідник `Користувачі` чи `Продавці` подивись.

Створи файл `test-soap.ps1`:

```powershell
$url  = "http://localhost/ltex_test/ws/MobileExchange.1cws"
$pass = "<пароль_продавця_з_тест-бази>"

$body = @"
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:m="http://arm_mobile">
  <soap:Body>
    <m:НачатьОбмен>
      <m:Версия>2.0</m:Версия>
      <m:ИдентификаторКлиента>test-claude</m:ИдентификаторКлиента>
      <m:ПарольВхода>$pass</m:ПарольВхода>
      <m:ЭтоНеПервыйОбмен>false</m:ЭтоНеПервыйОбмен>
    </m:НачатьОбмен>
  </soap:Body>
</soap:Envelope>
"@

curl.exe -s -X POST $url `
  -H "Content-Type: text/xml; charset=utf-8" `
  -H "SOAPAction: ``""``" `
  -d $body
```

Запусти `.\test-soap.ps1`. Очікуваний результат: XML SOAP-response без 500
помилки.

**Якщо 500 — копія повного відповіді:** перевір що пароль правильний.

## 5. Після Етапу 2 — додавання JSON-обгорток

Коли Worker завершить Етап 2, ти отримаєш у `docs/1c-bsl/outbound/`:

- `Module.bsl.append` — 6 нових Export-функцій
- `MobileExchange.xml.diff` — патч декларацій
- `СинкВхідний.bsl` — новий CommonModule
- `СинкЛог.xml` — Catalog metadata
- `СинкСистемнийПароль.xml` — Constant metadata
- `ЧисткаСинкЛогу.xml` — ScheduledJob
- `README.md` — детальна інструкція як вставити

**Загальна послідовність:**

1. У Конфігураторі (на тест-копії):
   - Створи нову Константу `СинкСистемнийПароль` (Стрічка 64)
   - Створи новий Довідник `СинкЛог` (за `СинкЛог.xml`)
   - Створи новий ЗагальнийМодуль `СинкВхідний` (вставити `СинкВхідний.bsl`)
   - Створи новий ШаблонРегламентного завдання `ЧисткаСинкЛогу`
   - Відкрий `WebService.MobileExchange.Modul Module` → додай в кінець вміст
     `Module.bsl.append`
   - Відкрий `WebService.MobileExchange` (декларація операцій) → додай 6 нових
     операцій згідно `MobileExchange.xml.diff`
2. **Зберегти** конфігу (Конфігурація → Зберегти)
3. **Оновити базу** (F7 або Конфігурація → Оновити конфігурацію бази даних)
4. **Перепублікувати** web-сервіс (Адміністрування → Публікація на
   веб-сервері → Опублікувати знову)
5. Перевір через `curl`:
   ```powershell
   curl.exe -s "http://localhost/ltex_test/ws/MobileExchange.1cws?wsdl" |
     Select-String "wsdl:operation" | Measure-Object
   # Має бути 30 (24 старих + 6 нових)
   ```
6. Виставити значення константи `СинкСистемнийПароль`:
   - Запусти 1С Підприємство (не Конфігуратор) → Адміністрування → Константи →
     `СинкСистемнийПароль` → введи **64-символьне значення**:
     ```powershell
     # Згенеруй на сервері (PowerShell):
     [System.Web.Security.Membership]::GeneratePassword(64, 0)
     # АБО
     -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 64 | % {[char]$_})
     ```
   - Запиши це значення також у `services/manager-sync/.env` (інструкція в
     Етапі 5).

## 6. Після smoke-test на тест-копії → production

1. Зробити backup production Central бази (за стандартним beckup-протоколом
   через `pg_dump` або 1С `Управление информационной базой`).
2. Повторити кроки 2-5 на production базі.
3. Замість `ltex_test` використати `ltex` (URL стане
   `http://localhost/ltex/ws/MobileExchange.1cws`).
4. Виставити **той самий пароль** `СинкСистемнийПароль` у production базі і у
   `services/manager-sync/.env`.

---

## ⚠️ Хто виконує що

| Крок                        | Хто                                      | Коли                      |
| --------------------------- | ---------------------------------------- | ------------------------- |
| 0. Перевірка веб-сервера    | User                                     | Зараз, поки Worker працює |
| 1. IIS ASP.NET features     | User                                     | Зараз                     |
| 2-3. Публікація тест-копії  | User                                     | Зараз                     |
| 4. Smoke test одного методу | User                                     | Зараз                     |
| 5. Додавання JSON wrappers  | User за `docs/1c-bsl/outbound/README.md` | Після Етапу 2 worker      |
| 6. Production publication   | User                                     | Після Етапу 5             |

**Час очікуваний:** Кроки 0-4 = ~30 хв (одноразова робота). Крок 5 = ~20 хв.
Крок 6 = ~15 хв.

## Якщо щось не виходить

Скопіюй повний вивід команди `curl`/PowerShell у наступному повідомленні до
мене, я допоможу діагностувати. Найчастіші помилки:

- 401 → авторизація (Anonymous не дозволений)
- 404 → 1С не зареєструвала vrd або шлях інший
- 500 → BSL exception (треба знати ПарольВхода або помилка у BSL)
