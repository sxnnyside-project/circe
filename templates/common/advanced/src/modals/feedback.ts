import { defineModal } from '@sxnnyside/circe';
import { MessageFlags } from 'discord.js';

export default defineModal({
  prefix: 'feedback-modal',
  async execute({ interaction, logger }) {
    const feedback = interaction.fields.getTextInputValue('feedback-input');
    logger.info(`Feedback received from ${interaction.user.tag}: ${feedback}`);

    await interaction.reply({
      content: 'Thank you for your feedback! Our team has received it.',
      flags: MessageFlags.Ephemeral,
    });
  },
});
