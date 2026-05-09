# PM2 log rotation setup for L-TEX self-hosted Windows Server.
# Run once from the repository root after PM2 is installed:
#   .\scripts\setup-pm2-logrotate.ps1
#
# Idempotent: re-running only re-applies the same configuration values.
# ASCII-only by convention (Cyrillic breaks the PowerShell parser on the
# server console code page; see CLAUDE.md).
#
# Background:
#   PM2 by default appends to E:\ltex-logs\store-out.log and store-error.log
#   forever. With production traffic these files grow until the disk fills.
#   The official pm2-logrotate module rotates by size and/or daily, keeps
#   a bounded retention, and can gzip rotated files.
#
# Settings applied below:
#   max_size        10M                       rotate when a single log >= 10 MB
#   retain          14                        keep 14 rotated files per stream
#   compress        true                      gzip rotated files
#   dateFormat      YYYY-MM-DD_HH-mm-ss       suffix for rotated filenames
#   rotateInterval  0 0 * * *                 also rotate daily at 00:00
#                                             (cron format, in addition to size)
#
# Disk usage envelope (worst case, before compression):
#   10 MB * 14 retained * 2 streams (out + error) = ~280 MB
# In practice gzip brings rotated text logs to ~10-15% of original
# so the steady-state on disk is ~50-70 MB.

$ErrorActionPreference = "Stop"

Write-Host "[1/3] Installing pm2-logrotate module (idempotent)..." -ForegroundColor Cyan
pm2 install pm2-logrotate

Write-Host "`n[2/3] Applying rotation settings..." -ForegroundColor Cyan
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval "0 0 * * *"

Write-Host "`n[3/3] Current pm2-logrotate configuration:" -ForegroundColor Cyan
pm2 conf pm2-logrotate

Write-Host "`nDone. Verify with: pm2 list  (pm2-logrotate should appear as 'online')" -ForegroundColor Green
Write-Host "Rotated files will appear in E:\ltex-logs\ with the date suffix and .gz extension."
