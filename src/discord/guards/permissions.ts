import type { GuildMember, PermissionResolvable } from 'discord.js';
import type { GuardResult } from '../commands/types.js';

/** The slice of any interaction context (command, context menu, component, modal) this guard reads. */
export interface MemberContext {
  readonly member: GuildMember | null;
}

/**
 * Blocks execution unless the invoking member has every permission listed.
 * Circe answers "does this member have BanMembers?" — deciding *who* should
 * (a role, a config-driven allowlist, etc.) is the bot's policy, not this
 * guard's concern. Works on every context that carries a `member`.
 */
export function hasPermission(
  ...permissions: PermissionResolvable[]
): (ctx: MemberContext) => GuardResult {
  return (ctx) => {
    if (!ctx.member) {
      return 'This command can only be used in a server.';
    }

    const missing = permissions.filter((permission) => !ctx.member?.permissions.has(permission));
    if (missing.length > 0) {
      return 'You do not have permission to use this command.';
    }

    return true;
  };
}
