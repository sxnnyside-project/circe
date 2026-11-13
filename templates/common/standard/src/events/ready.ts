import { defineEvent } from '@sxnnyside/circe';
import { Events } from 'discord.js';

export default defineEvent({
  name: Events.ClientReady,
  once: true,
  execute(client, { logger }) {
    logger.info(`Logged in as ${client.user.tag}! Ready to handle interactions.`);
  },
});
