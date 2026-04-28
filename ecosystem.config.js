// PM2 process manager configuration for L-TEX self-hosted deployment.
// Usage: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "ltex-store",
      script: ".next/standalone/server.js",
      cwd: "E:\\ltex-ecosystem\\apps\\store",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
      },
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "1G",
      // Logging
      error_file: "E:\\ltex-logs\\store-error.log",
      out_file: "E:\\ltex-logs\\store-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      // Graceful restart
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
