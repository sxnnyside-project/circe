import { defineErrorBoundary } from '@sxnnyside/circe';
import { MessageFlags } from 'discord.js';

export default defineErrorBoundary({
  async onCommandError(error, ctx) {
    ctx.logger.error(`Command error in /${ctx.interaction.commandName}: ${error.message}`, {
      error,
    });
    const message = 'An unexpected error occurred while executing this command.';
    if (ctx.interaction.deferred || ctx.interaction.replied) {
      await ctx.interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    } else {
      await ctx.interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  },
  async onComponentError(error, ctx) {
    ctx.logger.error(`Component error on ${ctx.interaction.customId}: ${error.message}`, { error });
    if (!ctx.interaction.replied && !ctx.interaction.deferred) {
      await ctx.interaction.reply({
        content: 'Failed to process interaction.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
});
