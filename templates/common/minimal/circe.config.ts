import { defineCirceConfig } from '@sxnnyside/circe';
import { GatewayIntentBits } from 'discord.js';
import config from './src/config.ts';

export default defineCirceConfig({
  config,
  intents: [GatewayIntentBits.Guilds],
});
