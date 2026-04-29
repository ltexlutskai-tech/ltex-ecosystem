# Session 54 — Worker Task: EAS Build Preview APK Setup

**Створено orchestrator-ом:** 2026-04-29
**Пріоритет:** P2 (mobile distribution — справжній native APK замість Expo Go)
**Очікуваний ефорт:** 30-45 хвилин (worker) + 30 хв (user setup)
**Тип:** worker session (config) + user-action (Expo account, signing)

---

## Контекст

User не задоволений Expo Go: повільно, нестабільно, не оптимізовано. Хоче справжній Android APK що ставиться як звичайний додаток.

S54 налаштовує **EAS Build (Expo Application Services)** — хмарна збірка нативних APK/IPA. **Безкоштовний tier:** ~30 збірок Android на місяць, для preview достатньо.

**Що ми отримуємо:**

1. `eas.json` config з 3 профілями: `development`, `preview` (APK для тестування), `production` (AAB для Play Store).
2. `app.json` оновлений — `extra.eas.projectId` після `eas init`.
3. Документація `docs/EAS_BUILD.md` — як user-у самому викликати `eas build`.

**Не у scope:** Apple App Store / TestFlight (потребує $99/рік Apple Developer + Mac), Google Play Store production (потребує $25 Google Play Developer + signing key generation). Для початку — preview APK, який можна шарити URL-ом без store-у.

---

## Branch

`claude/session-54-eas-build-preview` від main.

---

## Hard rules

1. НЕ ламати `app.json` поточну конфігурацію (bundle ids, плагіни, intents). Тільки додавати/доповнювати.
2. НЕ робити `eas init` сам — це user-action (треба Expo account login). Worker лише готує config.
3. `eas.json` profiles:
   - `development` — internal distribution, dev client (для майбутнього)
   - `preview` — internal distribution, APK build, **без credentials** (debug keystore від EAS)
   - `production` — store-ready AAB build (потребує Play Store signing key, окрема user-задача пізніше)
4. Не додавати нативних модулів що потребують `expo prebuild` зайво — бо це ламає managed workflow.
5. CI: 292 unit baseline + format + typecheck + build green. Без нових тестів.

---

## Файли

### 1. `apps/mobile-client/eas.json` (new)

```json
{
  "cli": {
    "version": ">= 13.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 2. `apps/mobile-client/app.json` — мінімальні правки

Додати `"runtimeVersion": { "policy": "sdkVersion" }` до `expo` (потрібно для EAS Update OTA).

```json
{
  "expo": {
    ...
    "runtimeVersion": { "policy": "sdkVersion" },
    "updates": {
      "url": "https://u.expo.dev/<EAS_PROJECT_ID>"
    },
    ...
  }
}
```

`<EAS_PROJECT_ID>` worker лишає placeholder `__SET_BY_EAS_INIT__` — user замінить після `eas init` коли отримає реальний UUID.

### 3. Перевірити assets

`apps/mobile-client/assets/icon.png` — Android icon 1024×1024
`apps/mobile-client/assets/splash.png` — splash screen 1284×2778 (або більше)
`apps/mobile-client/assets/adaptive-icon.png` — Android adaptive 1024×1024 transparent

Якщо їх немає — створити placeholder з зеленим фоном `#16a34a` і білим логотипом "L-TEX". Можна копіювати з `apps/store/public/manifest-icon-192.png` як старт. (User замінить на реальний дизайн пізніше.)

`app.json` посилається на ці шляхи у `expo.icon`, `expo.splash.image`, `expo.android.adaptiveIcon.foregroundImage` — додати якщо нема.

### 4. `docs/EAS_BUILD.md` (new)

````markdown
# EAS Build — як зібрати APK

## Перший раз (one-time setup)

1. Створити безкоштовний акаунт на https://expo.dev (sign up через GitHub або email)

2. Встановити EAS CLI глобально:
   ```bash
   npm install -g eas-cli
   ```
````

3. Залогінитись:

   ```bash
   eas login
   ```

4. Зайти у папку mobile-client:

   ```bash
   cd apps/mobile-client
   ```

5. Лінкнути проект з Expo dashboard:
   ```bash
   eas init
   ```
   Це згенерує `extra.eas.projectId` UUID — він автоматично вписується у `app.json`.

## Кожен раз коли хочеш новий APK

```bash
cd apps/mobile-client
eas build --platform android --profile preview
```

EAS збере APK у хмарі (~10-15 хвилин). Коли готово, у терміналі буде URL типу:

```
https://expo.dev/artifacts/eas/abc123.apk
```

Відкрий URL на Android-телефоні → завантажиться APK → "Install" → готово.

Або щоб всі тестери одразу мали посилання — `eas build` показує QR код в терміналі, скануєш у телефон, ставиш.

## Оновлення

Кожна зміна коду = новий `eas build` = новий APK = тестер перевстановлює.

**Альтернатива (швидше):** EAS Update — пушить лише JS-зміни без перебудови:

```bash
eas update --branch preview --message "fix: home banner overflow"
```

Це працює лише якщо JS-патч (без зміни native deps). Тестер перезапускає додаток і отримує оновлення без перевстановлення APK.

## Production (для Play Store) — у майбутньому

Окрема велика задача:

1. Google Play Developer account ($25 один раз)
2. Generate signing key
3. `eas build --platform android --profile production`
4. `eas submit --platform android` → автоматично завантажує AAB у Play Console

```

---

## Verification (worker pre-push)

1. `pnpm format:check` ✅ (включно з новим `eas.json`)
2. `pnpm -r typecheck` ✅
3. `pnpm -r test` 292/292 ✅
4. ASCII-only `deploy.ps1` ✅ (не зачіпається)

Worker НЕ запускає `eas build` — це user-action після merge + read `docs/EAS_BUILD.md`.

---

## Out-of-scope

- Apple App Store / iOS build (потребує Mac + $99/year)
- Google Play Store production submission (окрема велика задача з signing keys)
- Custom dev client (можна додати у наступну сесію якщо preview APK не задовольнить)
- Real assets (icon/splash/adaptive) — поки placeholder, реальний дизайн коли буде готовий
- EAS Update wire-up у app — `expo-updates` config (треба окремо коли user захоче OTA)

---

## Branch + commit + push

Branch: `claude/session-54-eas-build-preview`
Commit: `feat(s54): EAS Build preview APK config + docs`
Push на feature branch — НЕ мерджити. Orchestrator review-ить.

---

## Deploy notes

Without `deploy.ps1` interaction — це **mobile-only** конфіг, server не зачіпає.

**User-action чек-ліст після merge:**

1. `npm install -g eas-cli` (якщо ще не встановлено)
2. Створити Expo акаунт https://expo.dev
3. `cd apps/mobile-client && eas login && eas init`
4. Перевір `app.json` — `extra.eas.projectId` має заповнитись автоматично
5. Commit + push цю зміну (`projectId`)
6. `eas build --platform android --profile preview`
7. Чекати ~10-15 хв
8. Завантажити APK з URL → встановити на телефон → готово
```
