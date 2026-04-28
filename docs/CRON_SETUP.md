# Cron Setup (ViewLog Cleanup)

`POST /api/cron/cleanup-viewlog` drops `view_log` rows older than N days
(default 90, min 30, max 365). Endpoint is destructive — protected by a
shared secret. Якщо `CRON_SECRET` не виставлений (або коротший за 16
символів), endpoint завжди повертає 401.

## 1. Generate and store the secret

В `apps/store/.env` на сервері:

```env
CRON_SECRET=<32+ random chars>
```

PowerShell helper для генерації:

```powershell
[System.Web.Security.Membership]::GeneratePassword(32, 5)
```

Після зміни `.env` — `pm2 restart all` (або наступний `deploy.ps1`).

## 2. Windows Scheduled Task

Trigger: Daily 03:30 (після 03:00 backup-у `pg_dump`).

Action:

- Program: `powershell.exe`
- Arguments:
  ```
  -NoProfile -Command "Invoke-WebRequest -Uri 'http://localhost:3000/api/cron/cleanup-viewlog' -Method POST -Headers @{Authorization='Bearer YOUR_SECRET'} -UseBasicParsing | Select-Object -ExpandProperty Content | Out-File -FilePath 'E:\ltex-backups\cron-viewlog.log' -Append"
  ```

CLI варіант через `schtasks`:

```powershell
schtasks /Create /TN "L-TEX ViewLog Cleanup" /SC DAILY /ST 03:30 `
  /TR "powershell.exe -NoProfile -Command \"Invoke-WebRequest -Uri 'http://localhost:3000/api/cron/cleanup-viewlog' -Method POST -Headers @{Authorization='Bearer YOUR_SECRET'} -UseBasicParsing\"" `
  /RU SYSTEM /RL HIGHEST
```

## 3. Manual verification

```powershell
Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3000/api/cron/cleanup-viewlog" `
  -Headers @{Authorization="Bearer YOUR_SECRET"} -UseBasicParsing
# Expect 200: { "deleted": 0, "cutoff": "...", "days": 90 }
```

Custom retention (30-365 days):

```powershell
Invoke-WebRequest -Method POST `
  -Uri "http://localhost:3000/api/cron/cleanup-viewlog?days=30" `
  -Headers @{Authorization="Bearer YOUR_SECRET"} -UseBasicParsing
```

## Notes

- Hard delete — `prisma.viewLog.deleteMany`. Без soft-delete / archive.
- Recommendations algorithm дивиться лише останні 30 днів views, тому 90-day
  retention зберігає 60 днів запасу для аналітики.
- Secret приймається або через `Authorization: Bearer <secret>` header,
  або через `?token=<secret>` query param (зручно для quick curl-у).
