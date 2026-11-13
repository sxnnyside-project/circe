import type { GuildMember, PermissionResolvable } from 'discord.js';
import type { GuardResult } from '../commands/types.js';

/**
 * Context slice required by the {@link hasPermission} guard.
 *
 * @public
 */
export interface MemberContext {
  /** The guild member who invoked the interaction, or `null` if outside a guild. */
  readonly member: GuildMember | null;
}

/**
 * Creates a guard requiring the invoking guild member to possess all specified Discord permissions.
 *
 * @remarks
 * Evaluates `member.permissions.has(permission)` across all passed permissions. If executed
 * outside a guild (where `ctx.member` is `null`), automatically denies execution.
 *
 * @param permissions - One or more permissions required to execute the action.
 * @returns A guard function returning `true` if all permissions are held, or a denial string.
 *
 * @example
 * ```typescript
 * import { PermissionFlagsBits } from 'discord.js';
 * import { defineCommand, hasPermission } from '@sxnnyside/circe';
 *
 * export default defineCommand({
 *   builder: ...,
 *   guards: [hasPermission(PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers)],
 *   execute(ctx) { ... }
 * });
 * ```
 *
 * @public
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
