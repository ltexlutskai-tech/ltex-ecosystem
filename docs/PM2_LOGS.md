# PM2 логи та ротація

Документ описує як L-TEX керує логами PM2-процесу `ltex-store` на self-hosted
Windows Server. Стосується production-серверa (`new.ltex.com.ua`).

## Поточна конфігурація логів

Згідно з [`ecosystem.config.js`](../ecosystem.config.js):

| Поле              | Значення                       |
| ----------------- | ------------------------------ |
| `out_file`        | `E:\ltex-logs\store-out.log`   |
| `error_file`      | `E:\ltex-logs\store-error.log` |
| `log_date_format` | `YYYY-MM-DD HH:mm:ss Z`        |

PM2 за замовчуванням лише **append**-ить у ці файли, не ротуючи їх.
При активному traffic-у логи можуть рости на сотні МБ на тиждень і
заповнити диск `E:` повністю. Тому потрібна ротація.

## Що таке pm2-logrotate і чому потрібен

[`pm2-logrotate`](https://github.com/keymetrics/pm2-logrotate) — офіційний
модуль PM2 (керується через `pm2 install`), який:

- Перейменовує `store-out.log` у `store-out__YYYY-MM-DD_HH-mm-ss.log` коли
  файл перевищує заданий розмір **АБО** настає cron-інтервал.
- gzip-стискає ротований файл (`.log.gz`).
- Видаляє найстарші ротовані файли коли їх більше за `retain`.
- Працює як окремий PM2-процес (`pm2 list` його покаже).

Без нього диск рано чи пізно заповниться і Next.js standalone server впаде
через `ENOSPC` при першій же спробі писати у будь-який файл (Prisma cache,
.next/cache, npm logs тощо).

## Запуск setup-скрипта (one-time)

На сервері:

```powershell
cd E:\ltex-ecosystem
.\scripts\setup-pm2-logrotate.ps1
```

Скрипт ідемпотентний — повторний запуск лише перезастосує ті самі значення.
Не потребує перезапуску `ltex-store`.

## Налаштування, які застосовує скрипт

| Env-var (`pm2 set pm2-logrotate:<key>`) | Значення              | Опис                                           |
| --------------------------------------- | --------------------- | ---------------------------------------------- |
| `max_size`                              | `10M`                 | Ротувати коли файл досягає 10 МБ               |
| `retain`                                | `14`                  | Зберігати 14 ротованих файлів (старі видаляти) |
| `compress`                              | `true`                | gzip-стиск ротованих файлів                    |
| `dateFormat`                            | `YYYY-MM-DD_HH-mm-ss` | Суфікс для перейменованих файлів               |
| `rotateInterval`                        | `0 0 * * *`           | Додаткова daily-ротація о 00:00 (cron-формат)  |

## Оцінка дискового простору

Worst-case (без gzip):

```
10 MB * 14 retain * 2 streams (out + error) = ~280 MB
```

З `compress=true` текстові логи стискаються до ~10-15% від оригіналу,
тому реальний steady-state на диску — **~50-70 МБ**. Це безпечно для
будь-якого сервера, де `E:` має сотні ГБ вільного місця.

## Команди для щоденної роботи

### Дивитись поточні (нестиснуті) логи в реальному часі

```powershell
pm2 logs ltex-store --lines 200
```

Корисні прапорці:

- `--err` — лише stderr
- `--out` — лише stdout
- `--raw` — без префіксу `[ltex-store]` (зручно для grep)
- `--nostream` — вивести останні N рядків і вийти

### Подивитись список ротованих файлів

```powershell
dir E:\ltex-logs
```

Файли мають вигляд:

```
store-out__2026-05-06_00-00-00.log.gz
store-error__2026-05-06_00-00-00.log.gz
store-out.log         <- активний
store-error.log       <- активний
```

### Декомпресія .gz

```powershell
# у PowerShell 5+
Expand-Archive -Path E:\ltex-logs\store-out__2026-05-06_00-00-00.log.gz `
               -DestinationPath E:\ltex-logs\unpacked
```

Або через 7-Zip / `gzip -d` якщо встановлено:

```powershell
gzip -dk E:\ltex-logs\store-out__2026-05-06_00-00-00.log.gz
# залишить .log поряд з .gz
```

### Швидкий пошук по архівних логах

```powershell
# через 7-Zip без розпаковки:
7z e -so E:\ltex-logs\store-error__2026-05-06_*.log.gz | Select-String "Prisma"
```

## Зміна налаштувань пост-фактум

Після першого запуску скрипта налаштування зберігаються у `~\.pm2\module_conf.json`
і не скидаються при `pm2 update` чи рестарті. Щоб змінити окрему опцію:

```powershell
# Збільшити retention до 30 файлів
pm2 set pm2-logrotate:retain 30

# Зробити ротацію раз на годину додатково до size
pm2 set pm2-logrotate:rotateInterval "0 * * * *"

# Вимкнути gzip (не рекомендується)
pm2 set pm2-logrotate:compress false

# Подивитись поточну конфігурацію
pm2 conf pm2-logrotate
```

Зміни діють негайно, перезапуск `ltex-store` не потрібен.

## Troubleshooting

### Скрипт пройшов але логи не ротуються

```powershell
pm2 list
```

Має бути окремий процес `pm2-logrotate` зі статусом `online`. Якщо його немає:

```powershell
pm2 install pm2-logrotate
pm2 save
```

### `pm2-logrotate` у статусі `errored`

```powershell
pm2 logs pm2-logrotate --lines 100
```

Найчастіша причина — Windows file lock на активний `.log` (антивірус або
інший процес тримає handle). Рішення: додати `E:\ltex-logs\` в exclusion
list для Windows Defender.

### Ротовані файли не видаляються після перевищення `retain`

Перевірити що `retain` — число, а не строка з пробілом:

```powershell
pm2 conf pm2-logrotate
```

Якщо потрібно — переустановити: `pm2 uninstall pm2-logrotate` та запустити
скрипт повторно.

### Як повністю вимкнути ротацію

```powershell
pm2 uninstall pm2-logrotate
```

Після цього PM2 повертається до behavior за замовчуванням (нескінченний
append). Рекомендується НЕ робити цього на production.
