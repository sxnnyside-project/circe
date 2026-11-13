import { describe, expect, test } from 'bun:test';
import { defineMessageCommand, defineUserCommand } from '../../src/discord/context-menus/types.js';
import {
  createTestContextMenuInteraction,
  testContextMenu,
} from '../../src/testing/context-menu.js';
import { createMockMessage, createMockUser } from '../../src/testing/mock.js';

describe('createTestContextMenuInteraction', () => {
  test('creates a user context menu stub by default', () => {
    const { interaction } = createTestContextMenuInteraction();
    expect(interaction.isUserContextMenuCommand()).toBe(true);
    expect(interaction.isMessageContextMenuCommand()).toBe(false);
    expect((interaction as { targetUser?: unknown }).targetUser).toBeDefined();
  });

  test('creates a message context menu stub when targetMessage is supplied', () => {
    const targetMessage = createMockMessage({ content: 'Target content' });
    const { interaction } = createTestContextMenuInteraction({ targetMessage });
    expect(interaction.isUserContextMenuCommand()).toBe(false);
    expect(interaction.isMessageContextMenuCommand()).toBe(true);
    expect((interaction as { targetMessage?: { content: string } }).targetMessage?.content).toBe(
      'Target content',
    );
  });
});

describe('testContextMenu', () => {
  test('executes a user context menu command and records reply', async () => {
    const userCmd = defineUserCommand({
      name: 'View Avatar',
      execute: async (ctx) => {
        await ctx.interaction.reply({
          content: `Avatar for ${ctx.target.id}`,
          ephemeral: true,
        });
      },
    });

    const targetUser = createMockUser({ id: 'target-456' });
    const result = await testContextMenu(userCmd, { targetUser });

    expect(result.hasReply('Avatar for target-456')).toBe(true);
    expect(result.hasEphemeralReply()).toBe(true);
  });

  test('executes a message context menu command', async () => {
    const messageCmd = defineMessageCommand({
      name: 'Quote Message',
      execute: async (ctx) => {
        await ctx.interaction.reply({
          content: `Quoted: "${ctx.target.content}"`,
        });
      },
    });

    const targetMessage = createMockMessage({ content: 'Important note' });
    const result = await testContextMenu(messageCmd, {
      targetType: 'message',
      targetMessage,
    });

    expect(result.hasReply('Quoted: "Important note"')).toBe(true);
  });

  test('evaluates guards and denies execution with configured reason', async () => {
    const guardedCmd = defineUserCommand({
      name: 'Admin Poke',
      guards: [() => 'Only admins can poke!'],
      execute: async (ctx) => {
        await ctx.interaction.reply({ content: 'Poked!' });
      },
    });

    const result = await testContextMenu(guardedCmd);
    expect(result.hasReply('Only admins can poke!')).toBe(true);
    expect(result.hasReply('Poked!')).toBe(false);
    expect(result.hasEphemeralReply()).toBe(true);
  });

  test('catches execution failure in error boundary', async () => {
    const failingCmd = defineUserCommand({
      name: 'Exploding Command',
      execute: () => {
        throw new Error('Boom in context menu');
      },
    });

    const result = await testContextMenu(failingCmd);
    expect(result.hasReply('Something went wrong while running that action.')).toBe(true);
    expect(result.hasEphemeralReply()).toBe(true);
    expect(result.hasLog('error')).toBe(true);
  });
});
