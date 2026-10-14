import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { Events, MessageFlags } from 'discord.js';
import { ContextMenuCommandRegistry } from '../../../src/discord/context-menus/registry.js';
import { attachContextMenuRouter } from '../../../src/discord/context-menus/router.js';
import { createLogger, type LogEntry } from '../../../src/logging/logger.js';

type Reply = { content: string; flags?: number };

function setup(
  options: Parameters<typeof attachContextMenuRouter>[1] extends infer O ? Partial<O> : never = {},
) {
  const registry = new ContextMenuCommandRegistry();
  const entries: LogEntry[] = [];
  const logger = createLogger({ sink: (entry) => entries.push(entry) });
  const client = new EventEmitter();
  attachContextMenuRouter(client as never, { registry, logger, ...options });
  return { registry, entries, client };
}

function userInteraction(commandName: string) {
  const replies: Reply[] = [];
  const targetUser = { id: 'target-1' };
  return {
    replies,
    interaction: {
      commandName,
      deferred: false,
      replied: false,
      client: {},
      guild: { id: 'guild-1' },
      member: null,
      user: { id: 'user-1' },
      locale: 'en-US',
      targetMember: null,
      targetUser,
      isUserContextMenuCommand: () => true,
      isMessageContextMenuCommand: () => false,
      reply: async (payload: Reply) => {
        replies.push(payload);
      },
      followUp: async (payload: Reply) => {
        replies.push(payload);
      },
    },
    targetUser,
  };
}

function messageInteraction(commandName: string) {
  const { interaction, replies } = userInteraction(commandName);
  const targetMessage = { id: 'message-1' };
  return {
    replies,
    targetMessage,
    interaction: {
      ...interaction,
      targetMessage,
      isUserContextMenuCommand: () => false,
      isMessageContextMenuCommand: () => true,
    },
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('context menu router', () => {
  test('runs a user command with the resolved target', async () => {
    const { registry, client } = setup();
    let seen: unknown;
    registry.registerUser({
      name: 'Warn Member',
      execute: (ctx) => {
        seen = ctx.target;
      },
    });
    const { interaction, targetUser } = userInteraction('Warn Member');

    client.emit(Events.InteractionCreate, interaction);
    await flush();

    expect(seen).toBe(targetUser);
  });

  test('runs a message command with the target message', async () => {
    const { registry, client } = setup();
    let seen: unknown;
    registry.registerMessage({
      name: 'Report',
      execute: (ctx) => {
        seen = ctx.target;
      },
    });
    const { interaction, targetMessage } = messageInteraction('Report');

    client.emit(Events.InteractionCreate, interaction);
    await flush();

    expect(seen).toBe(targetMessage);
  });

  test('a denying guard replies with its reason and skips execute', async () => {
    const { registry, client } = setup();
    let executed = false;
    registry.registerUser({
      name: 'Warn Member',
      guards: [() => 'Moderators only.'],
      execute: () => {
        executed = true;
      },
    });
    const { interaction, replies } = userInteraction('Warn Member');

    client.emit(Events.InteractionCreate, interaction);
    await flush();

    expect(executed).toBe(false);
    expect(replies).toEqual([{ content: 'Moderators only.', flags: MessageFlags.Ephemeral }]);
  });

  test('onGuardDenied overrides the default reply', async () => {
    const denials: string[] = [];
    const { registry, client } = setup({
      onGuardDenied: (_ctx, reason) => {
        denials.push(reason);
      },
    });
    registry.registerMessage({ name: 'Report', guards: [() => 'nope'], execute: () => {} });
    const { interaction, replies } = messageInteraction('Report');

    client.emit(Events.InteractionCreate, interaction);
    await flush();

    expect(denials).toEqual(['nope']);
    expect(replies).toEqual([]);
  });

  test('a throwing handler is reported once and answered with a safe reply', async () => {
    const reported: string[] = [];
    const { registry, client, entries } = setup({
      onError: (error) => {
        reported.push(error.message);
      },
    });
    registry.registerUser({
      name: 'Warn Member',
      execute: () => {
        throw new Error('boom');
      },
    });
    const { interaction, replies } = userInteraction('Warn Member');

    client.emit(Events.InteractionCreate, interaction);
    await flush();

    expect(reported).toEqual(['boom']);
    expect(replies).toHaveLength(1);
    expect(entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  test('an unregistered command gets the default not-available reply', async () => {
    const { client } = setup();
    const { interaction, replies } = userInteraction('Missing');

    client.emit(Events.InteractionCreate, interaction);
    await flush();

    expect(replies).toEqual([
      { content: 'This action is not currently available.', flags: MessageFlags.Ephemeral },
    ]);
  });
});
