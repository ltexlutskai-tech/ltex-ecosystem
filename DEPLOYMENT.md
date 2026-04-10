# L-TEX Self-Hosted Deployment Guide

Deployment on Windows Server 2022 with Node.js standalone, PostgreSQL, PM2, and Caddy.

## Server Requirements

- Windows Server 2019/2022
- 4+ GB RAM free (recommended: 8+ GB)
- 10+ GB disk space
- Static public IP address
- Ports 80 and 443 available

## Step 1: Install Software

### 1.1 Node.js 22 LTS

Download from https://nodejs.org/ (Windows x64 installer).
After install, open PowerShell and verify:

```powershell
node --version   # v22.x.x
npm --version    # 10.x.x
```

### 1.2 pnpm

```powershell
npm install -g pnpm
pnpm --version   # 9.x.x
```

### 1.3 PM2 (process manager)

```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

### 1.4 PostgreSQL 16

Download from https://www.postgresql.org/download/windows/

- Install to `E:\PostgreSQL\16\`
- Set superuser password (save it!)
- Default port: 5432
- Locale: Ukrainian_Ukraine.1251

After install, create the database:

```powershell
# Open psql (or use pgAdmin)
& "E:\PostgreSQL\16\bin\psql.exe" -U postgres

# In psql:
CREATE DATABASE ltex_ecosystem;
CREATE USER ltex WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE ltex_ecosystem TO ltex;
\q
```

### 1.5 Caddy (reverse proxy)

Download from https://caddyserver.com/download (Windows amd64).
Place `caddy.exe` in `E:\caddy\`.

### 1.6 Git

Download from https://git-scm.com/download/win if not already installed.

## Step 2: Clone and Build

```powershell
E:
mkdir E:\ltex-ecosystem
cd E:\ltex-ecosystem
git clone https://github.com/ltexlutskai-tech/ltex-ecosystem.git .
```

### 2.1 Create `.env` file

Create `apps/store/.env`:

```env
# Database (local PostgreSQL)
DATABASE_URL="postgresql://ltex:your-secure-password@localhost:5432/ltex_ecosystem"
DIRECT_URL="postgresql://ltex:your-secure-password@localhost:5432/ltex_ecosystem"

# Supabase (keep for auth + storage)
NEXT_PUBLIC_SUPABASE_URL=https://auxrlweedivnffxjwvln.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Site
NEXT_PUBLIC_SITE_URL=https://ltex.com.ua

# Sync API (generate: openssl rand -hex 32)
SYNC_API_KEY=your-sync-api-key

# Optional: Telegram notifications
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_CHAT_ID=

# Optional: Viber bot
# VIBER_AUTH_TOKEN=

# Optional: Umami analytics
# NEXT_PUBLIC_UMAMI_WEBSITE_ID=
# NEXT_PUBLIC_UMAMI_SCRIPT_URL=
```

### 2.2 Install, generate, build

```powershell
pnpm install --frozen-lockfile
pnpm --filter @ltex/db exec prisma generate
pnpm --filter @ltex/db exec prisma db push
pnpm build --filter=@ltex/store...
```

### 2.3 Copy static assets to standalone

Next.js standalone output doesn't include `static` and `public` folders.
Copy them manually (or use `scripts/deploy.ps1`):

```powershell
Copy-Item -Recurse -Force "apps\store\.next\static" "apps\store\.next\standalone\apps\store\.next\static"
Copy-Item -Recurse -Force "apps\store\public" "apps\store\.next\standalone\apps\store\public"
```

## Step 3: Migrate Data from Supabase

If you have existing data in Supabase PostgreSQL:

```powershell
# Export from Supabase
pg_dump "postgresql://postgres.auxrlweedivnffxjwvln:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres" --data-only --no-owner > backup.sql

# Import to local PostgreSQL
& "E:\PostgreSQL\16\bin\psql.exe" -U ltex -d ltex_ecosystem -f backup.sql
```

Or seed fresh data:

```powershell
pnpm db:seed
```

## Step 4: Configure Network

### 4.1 Windows Firewall

```powershell
# Allow Caddy (HTTP + HTTPS)
New-NetFirewallRule -DisplayName "Caddy HTTP" -Direction Inbound -Port 80 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Caddy HTTPS" -Direction Inbound -Port 443 -Protocol TCP -Action Allow
```

### 4.2 Router Port Forwarding

In your router admin panel, forward:

- External port 80 → 192.168.0.10:80
- External port 443 → 192.168.0.10:443

### 4.3 Cloudflare DNS (recommended)

1. Create free Cloudflare account at https://cloudflare.com
2. Add domain `ltex.com.ua`
3. Change nameservers at your domain registrar to Cloudflare's
4. Add DNS records:
   - Type: A, Name: @, Value: 194.187.154.162, Proxy: ON (orange cloud)
   - Type: A, Name: www, Value: 194.187.154.162, Proxy: ON
5. SSL/TLS → Full (strict)

**Benefits:** Free DDoS protection, CDN caching, hides server IP.

**Important:** If using Cloudflare proxy, configure Caddy for Cloudflare:

```
ltex.com.ua {
    reverse_proxy localhost:3000
    encode gzip zstd
}
```

Cloudflare handles SSL termination, so Caddy receives plain HTTP from Cloudflare.
Set Cloudflare SSL mode to "Full (strict)" and Caddy will still auto-provision a cert.

## Step 5: Start Services

### 5.1 Create log directory

```powershell
mkdir E:\ltex-logs
```

### 5.2 Start Next.js via PM2

```powershell
cd E:\ltex-ecosystem
pm2 start ecosystem.config.js
pm2 save
```

Verify: `pm2 status` should show `ltex-store` as `online`.

### 5.3 Start Caddy

```powershell
# First run (test):
E:\caddy\caddy.exe run --config E:\ltex-ecosystem\Caddyfile

# As a Windows service (persistent):
E:\caddy\caddy.exe install --config E:\ltex-ecosystem\Caddyfile
net start caddy
```

### 5.4 Verify

Open browser: `https://ltex.com.ua` -- should show the L-TEX homepage.

## Updating (Deploy)

After pushing new code to `main`:

```powershell
cd E:\ltex-ecosystem
.\scripts\deploy.ps1
```

Or manually:

```powershell
git pull origin main
pnpm install --frozen-lockfile
pnpm --filter @ltex/db exec prisma generate
pnpm build --filter=@ltex/store...
# Copy static assets (see Step 2.3)
pm2 restart ltex-store
```

## Monitoring

```powershell
# PM2 status
pm2 status

# Live logs
pm2 logs ltex-store

# Restart
pm2 restart ltex-store

# Resource usage
pm2 monit
```

## Troubleshooting

### Port already in use

```powershell
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

### Prisma connection error

Check `DATABASE_URL` in `apps/store/.env`. Verify PostgreSQL is running:

```powershell
Get-Service -Name "postgresql*"
```

### Caddy SSL error

Ensure ports 80 and 443 are forwarded and not blocked by firewall.
Check Caddy logs: `E:\caddy\caddy.exe run --config E:\ltex-ecosystem\Caddyfile`

### PM2 not starting on boot

```powershell
pm2-startup install
pm2 save
```
