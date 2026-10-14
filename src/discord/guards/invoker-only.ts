import type { User } from 'discord.js';
import type { GuardResult } from '../commands/types.js';

/** The slice of a component context this guard reads. */
export interface InvokerContext {
  readonly user: User;
  readonly interaction: {
    readonly message?: {
      readonly interactionMetadata?: { readonly user: { readonly id: string } } | null;
    };
    readonly customId: string;
  };
}

export interface InvokerOnlyOptions {
  /**
   * Where the owner's id comes from when it isn't the user who triggered the
   * message's originating interaction (e.g. an id encoded in the `customId`).
   * Return `undefined` to deny: ownership that cannot be established is
   * never assumed.
   */
  readonly resolveOwnerId?: (ctx: InvokerContext) => string | undefined;
}

/**
 * Restricts a component or modal to the user who invoked the interaction
 * that produced the message it lives on. Mechanism only — what a non-owner
 * is told is the bot's `onGuardDenied` presentation.
 */
export function invokerOnly(
  options: InvokerOnlyOptions = {},
): (ctx: InvokerContext) => GuardResult {
  return (ctx) => {
    const ownerId =
      options.resolveOwnerId?.(ctx) ?? ctx.interaction.message?.interactionMetadata?.user.id;
    return ownerId !== undefined && ownerId === ctx.user.id
      ? true
      : 'Only the user who started this can use it.';
  };
}
