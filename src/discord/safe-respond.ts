import { type InteractionReplyOptions, MessageFlags } from 'discord.js';

/** The slice of every repliable interaction kind the routers' fallback replies need. */
interface Repliable {
  readonly deferred: boolean;
  readonly replied: boolean;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/**
 * The routers' default error/denial reply. Uses `flags` rather than the
 * deprecated `ephemeral` option, and never throws: the interaction may
 * already have expired or been deleted, and there is nothing left to do.
 */
export async function safeEphemeralReply(interaction: Repliable, content: string): Promise<void> {
  const payload = { content, flags: MessageFlags.Ephemeral } as const;
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // The interaction may already have expired or been deleted — nothing more to do.
  }
}
