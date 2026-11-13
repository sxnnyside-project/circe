import { type InteractionReplyOptions, MessageFlags } from 'discord.js';

/**
 * Minimal interface representing any repliable Discord interaction.
 *
 * @internal
 */
export interface Repliable {
  /** Whether the interaction reply has been acknowledged via deferral. */
  readonly deferred: boolean;
  /** Whether the interaction has already been answered. */
  readonly replied: boolean;
  /** Sends a secondary follow-up reply message. */
  followUp(options: InteractionReplyOptions): Promise<unknown>;
  /** Sends the initial reply message. */
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/**
 * Sends an ephemeral fallback reply safely without throwing if the interaction expired or was deleted.
 *
 * @remarks
 * Uses modern `flags: MessageFlags.Ephemeral` instead of deprecated `ephemeral: true`.
 * Automatically routes to `followUp` if `deferred` or `replied` is true; otherwise calls `reply`.
 * All network or lifecycle errors are silently caught.
 *
 * @param interaction - The repliable interaction instance.
 * @param content - Plain text error or denial message.
 *
 * @internal
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
