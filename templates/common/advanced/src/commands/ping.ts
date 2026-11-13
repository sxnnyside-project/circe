import { cooldown, defineCommand } from '@sxnnyside/circe';
import { SqliteCooldownStore } from '@sxnnyside/circe/sqlite';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const cooldownStore = new SqliteCooldownStore(':memory:');

export default defineCommand({
  builder: new SlashCommandBuilder().setName('ping').setDescription('Check latency with cooldown.'),
  guards: [cooldown(5000, { store: cooldownStore })],
  async execute(ctx) {
    const latency = Date.now() - ctx.interaction.createdTimestamp;
    await ctx.interaction.reply({
      content: ctx.t('ping.reply', { latency }),
      flags: MessageFlags.Ephemeral,
    });
  },
});
