import { defineCirceConfig } from '@sxnnyside/circe';
import { GatewayIntentBits } from 'discord.js';
import config from './src/config.ts';

export default defineCirceConfig({
  config,
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  health: {
    port: 8080,
    checks: {
      memory: () => process.memoryUsage().heapUsed < 500 * 1024 * 1024,
    },
  },
  onUnhandledRejection: 'exit',
  shutdownTimeoutMs: 10000,
});
