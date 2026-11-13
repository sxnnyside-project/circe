import { describe, expect, test } from 'bun:test';
import { PermissionsBitField } from 'discord.js';
import {
  createMockChannel,
  createMockGuild,
  createMockMember,
  createMockMessage,
  createMockUser,
} from '../../src/testing/mock.js';

describe('createMockUser', () => {
  test('creates a default user with generated snowflake', () => {
    const user = createMockUser();
    expect(user.id).toBeDefined();
    expect(user.bot).toBe(false);
    expect(user.username).toMatch(/^user_\d+/);
    expect(user.toString()).toBe(`<@${user.id}>`);
  });

  test('accepts partial overrides', () => {
    const user = createMockUser({ id: '12345', username: 'custom_user', bot: true });
    expect(user.id).toBe('12345');
    expect(user.username).toBe('custom_user');
    expect(user.bot).toBe(true);
  });
});

describe('createMockGuild', () => {
  test('creates a default guild with name and member count', () => {
    const guild = createMockGuild();
    expect(guild.id).toBeDefined();
    expect(guild.memberCount).toBe(42);
    expect(guild.available).toBe(true);
    expect(guild.toString()).toBe(guild.name);
  });

  test('accepts overrides', () => {
    const guild = createMockGuild({ id: 'guild-99', name: 'My Server' });
    expect(guild.id).toBe('guild-99');
    expect(guild.name).toBe('My Server');
  });
});

describe('createMockMember', () => {
  test('creates a member bound to user and guild with default permissions', () => {
    const member = createMockMember();
    expect(member.id).toBe(member.user.id);
    expect(member.permissions.has(PermissionsBitField.Flags.SendMessages)).toBe(true);
    expect(member.toString()).toBe(`<@!${member.user.id}>`);
  });

  test('accepts custom user and custom permissions', () => {
    const user = createMockUser({ id: 'admin-1', username: 'admin' });
    const perms = new PermissionsBitField([PermissionsBitField.Flags.Administrator]);
    const member = createMockMember({ user, permissions: perms });
    expect(member.id).toBe('admin-1');
    expect(member.permissions.has(PermissionsBitField.Flags.Administrator)).toBe(true);
  });
});

describe('createMockChannel', () => {
  test('creates a mock text channel capable of sending messages', async () => {
    const channel = createMockChannel({ name: 'general' });
    expect(channel.name).toBe('general');
    expect(channel.isTextBased()).toBe(true);
    expect(channel.isDMBased()).toBe(false);
    expect(channel.toString()).toBe(`<#${channel.id}>`);

    const sent = await channel.send('Hello from test');
    expect(sent.content).toBe('Hello from test');
    expect(sent.channelId).toBe(channel.id);
  });
});

describe('createMockMessage', () => {
  test('creates a mock message with author, channel, and reply helper', async () => {
    const msg = createMockMessage({ content: 'Initial message' });
    expect(msg.content).toBe('Initial message');
    expect(msg.author).toBeDefined();
    expect(msg.channel).toBeDefined();

    const reply = await msg.reply('Reply content');
    expect(reply.content).toBe('Reply content');
  });
});
