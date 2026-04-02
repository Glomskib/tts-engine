/**
 * PM2 Ecosystem Config — FlashFlow Render Node
 *
 * On the Mac mini:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup   (follow the printed command to auto-start on reboot)
 */

module.exports = {
  apps: [
    {
      name: 'flashflow-render',
      script: 'agent.ts',
      interpreter: 'ts-node',
      interpreter_args: '--project tsconfig.json',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 20,
      env_file: '.env',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/render-error.log',
      out_file: './logs/render-out.log',
      merge_logs: true,
      // Keep process alive — it handles its own retry backoff internally
      min_uptime: '10s',
      // Kill timeout for graceful shutdown
      kill_timeout: 10000,
    },
  ],
};
