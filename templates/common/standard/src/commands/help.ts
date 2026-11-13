import { defineCommand } from '@sxnnyside/circe';
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

export default defineCommand({
  builder: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Lists bot capabilities and commands.'),
  async execute(ctx) {
    const embed = new EmbedBuilder()
      .setTitle(ctx.t('help.title'))
      .setDescription('Built with Circe, the IoC framework for discord.js.')
      .setColor(0x5865f2)
      .addFields(
        { name: '/ping', value: 'Check latency and test button interactions', inline: true },
        { name: '/help', value: 'Show this information embed', inline: true },
      );

    await ctx.interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
});
