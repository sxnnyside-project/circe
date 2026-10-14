import { describe, expect, test } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import type { ComponentGuard } from '../../../src/discord/components/types.js';
import type { UserCommandGuard } from '../../../src/discord/context-menus/types.js';
import { cooldown } from '../../../src/discord/guards/cooldown/cooldown.js';
import { guildOnly } from '../../../src/discord/guards/guild-only.js';
import { hasPermission } from '../../../src/discord/guards/permissions.js';
import type { ModalGuard } from '../../../src/discord/modals/types.js';

describe('built-in guards across interaction kinds', () => {
  test('the same guard instances type-check as command, context-menu, component and modal guards', () => {
    const permission = hasPermission(PermissionFlagsBits.ModerateMembers);
    const guild = guildOnly();
    const limit = cooldown({ durationMs: 1000, scope: 'user' });

    const contextMenu: UserCommandGuard[] = [permission, guild, limit];
    const component: ComponentGuard[] = [permission, guild];
    const modal: ModalGuard[] = [permission, guild];

    expect(contextMenu.length + component.length + modal.length).toBe(7);
  });

  test('cooldown keys on the context menu command name', async () => {
    const guard = cooldown({ durationMs: 60_000, scope: 'user' });
    const ctx = {
      user: { id: 'u1' } as never,
      guild: null,
      interaction: { commandName: 'Warn Member', channelId: null },
    };
    expect(await guard(ctx)).toBe(true);
    expect(await guard(ctx)).not.toBe(true);
  });
});
