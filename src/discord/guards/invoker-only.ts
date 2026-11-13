import type { User } from 'discord.js';
import type { GuardResult } from '../commands/types.js';

/**
 * Context slice required by the {@link invokerOnly} guard.
 *
 * @public
 */
export interface InvokerContext {
  /** The Discord user who clicked or submitted the component/modal. */
  readonly user: User;
  /** The underlying interaction carrying the origin message metadata. */
  readonly interaction: {
    readonly message?: {
      readonly interactionMetadata?: { readonly user: { readonly id: string } } | null;
    };
    readonly customId: string;
  };
}

/**
 * Configuration options for the {@link invokerOnly} guard.
 *
 * @public
 */
export interface InvokerOnlyOptions {
  /**
   * Custom resolver extracting the intended owner ID (e.g. from a customId payload).
   *
   * @remarks
   * If this returns `undefined` and origin message metadata is absent, access is denied.
   *
   * @param ctx - The invoker context.
   * @returns The resolved owner Discord user ID, or `undefined` if unresolvable.
   */
  readonly resolveOwnerId?: (ctx: InvokerContext) => string | undefined;
}

/**
 * Creates a guard restricting component or modal interactions to the original invoker who created the message.
 *
 * @param options - Configuration options and optional custom ID owner resolver.
 * @returns A guard function ensuring only the originating user can interact with the component.
 *
 * @example
 * ```typescript
 * import { defineComponent, invokerOnly } from '@sxnnyside/circe';
 *
 * export default defineComponent({
 *   prefix: 'paginator:',
 *   guards: [invokerOnly()],
 *   execute(ctx) { ... }
 * });
 * ```
 *
 * @public
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
