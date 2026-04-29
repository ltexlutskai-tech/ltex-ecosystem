# EAS Build — як зібрати APK

Цей документ описує як зібрати справжній native Android APK через **EAS Build (Expo Application Services)**, замість Expo Go.

## Перший раз (one-time setup)

1. Створити безкоштовний акаунт на https://expo.dev (sign up через GitHub або email).

2. Встановити EAS CLI глобально:

   ```bash
   npm install -g eas-cli
   ```

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

   Це згенерує UUID і автоматично впише його у `app.json` → `extra.eas.projectId`. Також заміни `https://u.expo.dev/__SET_BY_EAS_INIT__` у `expo.updates.url` на реальний URL з тим самим UUID (`eas init` зробить це автоматично, але звір руками).

6. Закомітити заміну `__SET_BY_EAS_INIT__` → реальний UUID:

   ```bash
   git add app.json
   git commit -m "chore(mobile): set EAS projectId after eas init"
   git push
   ```

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

Або щоб усі тестери одразу мали посилання — `eas build` показує QR-код у терміналі, скануєш у телефон, ставиш.

## Профілі (`eas.json`)

| Профіль       | Distribution | Output | Призначення                                          |
| ------------- | ------------ | ------ | ---------------------------------------------------- |
| `development` | internal     | APK    | Dev client із live reload (для розробників)          |
| `preview`     | internal     | APK    | Тестова збірка для шарингу URL/QR без store-у        |
| `production`  | store        | AAB    | Готова збірка для Google Play (потребує signing key) |

Найчастіший: `preview`.

## Оновлення коду без перевстановлення APK (EAS Update)

**Альтернатива (швидше за rebuild):** EAS Update пушить лише JS-зміни без перебудови native:

```bash
eas update --branch preview --message "fix: home banner overflow"
```

Це працює тільки якщо JS-патч (без зміни native deps або `app.json`). Тестер перезапускає додаток → отримує оновлення без перевстановлення APK.

⚠️ Якщо змінювалось щось у native (нові плагіни, bundle id, intent filters, нова версія `expo` SDK) — треба новий `eas build`.

## Production (для Play Store) — у майбутньому

Окрема велика задача:

1. Google Play Developer account ($25 один раз).
2. Згенерувати signing key (`eas credentials`).
3. `eas build --platform android --profile production` → отримуєш AAB.
4. `eas submit --platform android` → автоматично завантажує AAB у Play Console.

## iOS — поки не у scope

Потребує Apple Developer Program ($99/рік) + Mac для XCode signing. Профіль `preview.ios.simulator: false` готовий до Apple build, але без credentials збірка не пройде.

## Troubleshooting

- **"Project not configured for EAS"** — перевір `extra.eas.projectId` у `app.json`. Якщо там `__SET_BY_EAS_INIT__` — запусти `eas init`.
- **"Invalid version"** — у профілі `production` стоїть `autoIncrement: true`, тому EAS сам збільшує `versionCode`. Для preview — просто bump `version` у `app.json` руками перед build, якщо хочеш.
- **Build висне на "Waiting in queue"** — безкоштовний tier має лімит ~30 Android builds/міс. Перевір `eas build:list` і https://expo.dev/accounts/<your>/projects/ltex-client/builds.
- **APK не ставиться (Android блокує)** — увімкни "Install from unknown sources" для свого браузера у налаштуваннях Android.

## User-action чек-ліст після merge S54

1. `npm install -g eas-cli` (якщо ще не встановлено).
2. Створити Expo акаунт https://expo.dev.
3. `cd apps/mobile-client && eas login && eas init`.
4. Перевір `app.json` — `extra.eas.projectId` має заповнитись (НЕ `__SET_BY_EAS_INIT__`).
5. Заміни `__SET_BY_EAS_INIT__` у `expo.updates.url` якщо `eas init` цього не зробив.
6. Commit + push цю зміну (`projectId` + `updates.url`).
7. `eas build --platform android --profile preview`.
8. Чекати ~10-15 хв.
9. Завантажити APK з URL → встановити на телефон → готово.
