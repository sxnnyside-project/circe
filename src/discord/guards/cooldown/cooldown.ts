import type { Guild, User } from 'discord.js';
import type { GuardResult } from '../../commands/types.js';
import { MemoryCooldownStore } from './memory-store.js';
import type { CooldownStore } from './types.js';

export type CooldownScope = 'user' | 'guild' | 'channel';

export interface CooldownOptions {
  readonly durationMs: number;
  readonly scope: CooldownScope;
  /** Defaults to a shared `MemoryCooldownStore` created for this guard instance. */
  readonly store?: CooldownStore;
}

/** The slice of a command or context-menu context this guard reads. */
export interface CooldownContext {
  readonly user: User;
  readonly guild: Guild | null;
  readonly interaction: { readonly commandName: string; readonly channelId: string | null };
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

/**
 * Composable rate-limiting precondition: blocks execution until
 * `durationMs` has passed since the last successful hit within `scope`.
 * When the requested scope has nothing to key on (e.g. `scope: "guild"`
 * outside a guild), the guard allows execution — it has no meaningful
 * boundary to enforce, and a bot that needs a guild present composes this
 * with `guildOnly()` first rather than relying on this guard for that.
 */
export function cooldown(options: CooldownOptions): (ctx: CooldownContext) => Promise<GuardResult> {
  const store = options.store ?? new MemoryCooldownStore();

  return async (ctx) => {
    const scopeId = resolveScopeId(ctx, options.scope);
    if (scopeId === undefined) {
      return true;
    }

    const key = `${ctx.interaction.commandName}:${options.scope}:${scopeId}`;
    const remainingMs = await store.check(key);

    if (remainingMs > 0) {
      const seconds = Math.ceil(remainingMs / 1000);
      return `This command is on cooldown. Try again in ${seconds}s.`;
    }

    await store.hit(key, options.durationMs);
    return true;
  };
}
