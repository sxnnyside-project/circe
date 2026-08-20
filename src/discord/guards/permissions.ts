import type { PermissionResolvable } from "discord.js";
import type { Guard } from "../commands/types.js";

/**
 * Blocks execution unless the invoking member has every permission listed.
 * Circe answers "does this member have BanMembers?" — deciding *who* should
 * (a role, a config-driven allowlist, etc.) is the bot's policy, not this
 * guard's concern.
 */
export function hasPermission(...permissions: PermissionResolvable[]): Guard {
  return (ctx) => {
    if (!ctx.member) {
      return "This command can only be used in a server.";
    }

    const missing = permissions.filter((permission) => !ctx.member?.permissions.has(permission));
    if (missing.length > 0) {
      return "You do not have permission to use this command.";
    }

    return true;
  };
}
