import { describe, expect, test } from 'bun:test';
import {
  createTestComponentInteraction,
  createTestInteraction,
  toTestReply,
} from '../../src/testing/interaction.js';
import { createMockChannel, createMockMember, createMockUser } from '../../src/testing/mock.js';

describe('createTestInteraction options parsing', () => {
  test('resolves primitive option types correctly', () => {
    const { interaction } = createTestInteraction({
      options: {
        query: 'search term',
        count: 42,
        ratio: 3.14,
        active: true,
      },
    });

    expect(interaction.options.getString('query')).toBe('search term');
    expect(interaction.options.getInteger('count')).toBe(42);
    expect(interaction.options.getNumber('ratio')).toBe(3.14);
    expect(interaction.options.getBoolean('active')).toBe(true);
    expect(interaction.options.getString('missing')).toBeNull();
  });

  test('resolves Discord model option types (user, member, channel)', () => {
    const user = createMockUser({ id: 'u123' });
    const member = createMockMember({ user });
    const channel = createMockChannel({ id: 'c456' });

    const { interaction } = createTestInteraction({
      options: {
        targetUser: user,
        targetMember: member,
        targetChannel: channel,
      },
    });

    expect(interaction.options.getUser('targetUser')).toEqual(user);
    expect(interaction.options.getMember('targetMember')).toEqual(member);
    expect(interaction.options.getChannel('targetChannel')).toEqual(channel);
  });

  test('throws when a required option is missing', () => {
    const { interaction } = createTestInteraction({
      options: {},
    });

    expect(() => interaction.options.getString('requiredField', true)).toThrow(
      'Required option "requiredField" was not provided in test options',
    );
  });

  test('supports subcommand and subcommandGroup routing', () => {
    const { interaction } = createTestInteraction({
      subcommand: 'kick',
      subcommandGroup: 'moderation',
    });

    expect(interaction.options.getSubcommand()).toBe('kick');
    expect(interaction.options.getSubcommandGroup()).toBe('moderation');
  });
});

describe('createTestInteraction reply lifecycle (deferReply, editReply, deleteReply)', () => {
  test('handles deferReply followed by editReply', async () => {
    const { interaction, replies } = createTestInteraction();
    expect(interaction.deferred).toBe(false);

    await interaction.deferReply({ ephemeral: true });
    expect(interaction.deferred).toBe(true);
    expect(replies).toEqual([{ content: '', ephemeral: true }]);

    await interaction.editReply('Final answer');
    expect(interaction.replied).toBe(true);
    expect(replies).toEqual([{ content: 'Final answer', ephemeral: true }]);
  });

  test('handles deleteReply', async () => {
    const { interaction, replies } = createTestInteraction();
    await interaction.reply('Temporary message');
    expect(replies).toHaveLength(1);

    await interaction.deleteReply();
    expect(replies).toHaveLength(0);
  });

  test('records modals opened via showModal', async () => {
    const { interaction, modals } = createTestInteraction();
    const modalPayload = { customId: 'feedback_form', title: 'Feedback' };

    await interaction.showModal(modalPayload as never);
    expect(modals).toHaveLength(1);
    expect(modals[0]).toEqual(modalPayload);
  });
});

describe('createTestComponentInteraction select menus and lifecycle', () => {
  test('identifies as button when values is empty', () => {
    const { interaction } = createTestComponentInteraction();
    expect(interaction.isButton()).toBe(true);
    expect(interaction.isAnySelectMenu()).toBe(false);
  });

  test('identifies as select menu and exposes values when values is provided', () => {
    const { interaction } = createTestComponentInteraction({
      customId: 'roles_select',
      values: ['role_admin', 'role_mod'],
    });

    expect(interaction.isButton()).toBe(false);
    expect(interaction.isAnySelectMenu()).toBe(true);
    expect(interaction.isStringSelectMenu()).toBe(true);
    expect(interaction.values).toEqual(['role_admin', 'role_mod']);
  });

  test('records update() responses', async () => {
    const { interaction, updates } = createTestComponentInteraction();
    await interaction.update('Component updated');
    expect(updates).toHaveLength(1);
    const text = typeof updates[0] === 'string' ? updates[0] : updates[0]?.content;
    expect(text).toBe('Component updated');
  });
});

describe('toTestReply helper', () => {
  test('converts bare string into TestReply', () => {
    expect(toTestReply('Hello')).toBe('Hello' as never);
  });

  test('normalizes ephemeral flag and preserves custom flags', () => {
    expect(toTestReply({ content: 'Secret', ephemeral: true })).toEqual({
      content: 'Secret',
      ephemeral: true,
    });
  });
});
