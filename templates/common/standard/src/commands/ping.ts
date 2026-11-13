import { defineCommand } from '@sxnnyside/circe';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';

export default defineCommand({
  builder: new SlashCommandBuilder().setName('ping').setDescription('Replies with pong.'),
  async execute(ctx) {
    const latency = Date.now() - ctx.interaction.createdTimestamp;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn:ping:refresh')
        .setLabel('Ping Again')
        .setStyle(ButtonStyle.Primary),
    );

    await ctx.interaction.reply({
      content: ctx.t('ping.reply', { latency }),
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
});
