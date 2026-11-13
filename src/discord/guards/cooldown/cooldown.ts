import type { Guild, User } from 'discord.js';
import type { GuardResult } from '../../commands/types.js';
import { MemoryCooldownStore } from './memory-store.js';
import type { CooldownStore } from './types.js';

/**
 * The boundary scope across which a rate-limiting cooldown is enforced.
 *
 * @public
 */
export type CooldownScope = 'user' | 'guild' | 'channel';

/**
 * Configuration options for the {@link cooldown} guard.
 *
 * @public
 */
export interface CooldownOptions {
  /** The cooldown window duration in milliseconds. */
  readonly durationMs: number;
  /** The partition scope across which hits are isolated. */
  readonly scope: CooldownScope;
  /**
   * Underlying persistence store for cooldown tracking.
   * @defaultValue A {@link MemoryCooldownStore} private to this guard
   */
  readonly store?: CooldownStore;
}

/**
 * Context slice required by the {@link cooldown} guard.
 *
 * @public
 */
export interface CooldownContext {
  /** The Discord user triggering the interaction. */
  readonly user: User;
  /** The Discord guild where the command ran, or `null` if in DMs. */
  readonly guild: Guild | null;
  /** Interaction identifier slice used to derive the command key. */
  readonly interaction: {
    readonly commandName: string;
    readonly channelId: string | null;
    /** On chat-input interactions this is the options resolver; reading it tells sibling subcommands apart. */
    readonly options?: unknown;
  };
}

interface SubcommandReader {
  getSubcommandGroup?(required?: boolean): string | null;
  getSubcommand?(required?: boolean): string | null;
}

function commandKey(ctx: CooldownContext): string {
  const { commandName } = ctx.interaction;
  const options = ctx.interaction.options as SubcommandReader | undefined;
  const group = options?.getSubcommandGroup?.(false);
  const subcommand = options?.getSubcommand?.(false);
  return [commandName, group, subcommand].filter((part) => part).join(':');
}

function resolveScopeId(ctx: CooldownContext, scope: CooldownScope): string | undefined {
  switch (scope) {
    case 'user':
      return ctx.user.id;
    case 'guild':
      return ctx.guild?.id;
    case 'channel':
      return ctx.interaction.channelId ?? undefined;
  }
}

/** Uses the store's atomic `claim` when it has one; `check` then `hit` is only safe for one process. */
async function claimCooldown(
  store: CooldownStore,
  key: string,
  durationMs: number,
): Promise<number> {
  if (store.claim) {
    return store.claim(key, durationMs);
  }
  const remainingMs = await store.check(key);
  if (remainingMs === 0) {
    await store.hit(key, durationMs);
  }
  return remainingMs;
}

/**
 * Creates a composable rate-limiting guard blocking interaction execution until `durationMs` has elapsed.
 *
 * @remarks
 * Keys hits dynamically by command path (`command:group:subcommand`) and scope target (`user`, `guild`, or `channel`).
 * If the target scope is unavailable (e.g. `scope: 'guild'` in a DM), execution is permitted.
 *
 * @param options - Duration, scope boundary, and optional custom persistence store.
 * @returns An async guard returning `true` or a human-friendly cooldown countdown string.
 *
 * @example
 * ```typescript
 * import { cooldown, defineCommand } from '@sxnnyside/circe';
 *
 * export default defineCommand({
 *   builder: ...,
 *   guards: [cooldown({ durationMs: 10_000, scope: 'user' })],
 *   execute(ctx) { ... }
 * });
 * ```
 *
 * @public
 */
export function cooldown(options: CooldownOptions): (ctx: CooldownContext) => Promise<GuardResult> {
  const store = options.store ?? new MemoryCooldownStore();

  return async (ctx) => {
    const scopeId = resolveScopeId(ctx, options.scope);
    if (scopeId === undefined) {
      return true;
    }

    const key = `${commandKey(ctx)}:${options.scope}:${scopeId}`;
    const remainingMs = await claimCooldown(store, key, options.durationMs);

    if (remainingMs > 0) {
      const seconds = Math.ceil(remainingMs / 1000);
      return `This command is on cooldown. Try again in ${seconds}s.`;
    }

    return true;
  };
}
