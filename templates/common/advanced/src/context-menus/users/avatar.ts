import { defineUserCommand } from '@sxnnyside/circe';
import { MessageFlags } from 'discord.js';

export default defineUserCommand({
  name: 'View Avatar',
  async execute({ interaction, target }) {
    const avatarUrl = target.displayAvatarURL({ size: 1024 });
    await interaction.reply({
      content: `${target}'s avatar: ${avatarUrl}`,
      flags: MessageFlags.Ephemeral,
    });
  },
});
