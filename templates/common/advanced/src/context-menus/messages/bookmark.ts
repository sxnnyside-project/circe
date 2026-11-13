import { defineMessageCommand } from '@sxnnyside/circe';
import { MessageFlags } from 'discord.js';

export default defineMessageCommand({
  name: 'Bookmark Message',
  async execute({ interaction, target }) {
    const content = target.content ? `\n> ${target.content.slice(0, 500)}` : '';
    await interaction.user
      .send({
        content: `🔖 **Bookmarked message** from ${target.author.tag} in ${interaction.channel}:\n${target.url}${content}`,
      })
      .catch(() => null);

    await interaction.reply({
      content: 'Message bookmarked and sent to your DMs!',
      flags: MessageFlags.Ephemeral,
    });
  },
});
