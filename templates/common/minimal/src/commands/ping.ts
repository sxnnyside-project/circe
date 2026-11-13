import { defineCommand } from '@sxnnyside/circe';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';

export default defineCommand({
  builder: new SlashCommandBuilder().setName('ping').setDescription('Replies with pong.'),
  async execute(ctx) {
    await ctx.interaction.reply({ content: '🏓 Pong!', flags: MessageFlags.Ephemeral });
  },
});
