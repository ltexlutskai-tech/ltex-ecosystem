// PM2 process manager configuration for L-TEX self-hosted deployment.
// Usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "ltex-store",
      // Next.js standalone output places the runnable server.js inside
      // apps/store/.next/standalone/apps/store/, NOT at standalone/server.js.
      // PM2 must `cwd` into that nested folder so relative requires resolve.
      script: "server.js",
      cwd: "E:\\ltex-ecosystem\\apps\\store\\.next\\standalone\\apps\\store",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // "::" makes Node listen on both IPv4 and IPv6 (Cloudflare tunnel
        // sometimes connects via IPv6); keep this here, not "0.0.0.0".
        HOSTNAME: "::",
      },
      // fork mode: deterministic single process. cluster on Windows leaves
      // orphan node.exe workers after `pm2 stop`/`pm2 delete` which then
      // hold .next/cache write-locks and hang the next `next build`. See
      // docs/SESSION_41_DEPLOY_FORK_MODE.md.
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      error_file: "E:\\ltex-logs\\store-error.log",
      out_file: "E:\\ltex-logs\\store-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      kill_timeout: 5000,
      listen_timeout: 10000,
      restart_delay: 5000,
      min_uptime: "30s",
      max_restarts: 50,
    },
  ],
};
