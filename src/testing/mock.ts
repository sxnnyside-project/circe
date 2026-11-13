import type { Guild, GuildMember, Message, TextChannel, User } from 'discord.js';
import { PermissionsBitField } from 'discord.js';

let mockIdCounter = 1_000_000_000_000_000n;

function nextSnowflake(): string {
  mockIdCounter += 1n;
  return mockIdCounter.toString();
}

/**
 * Overrides helper type for Discord.js stub creation in unit tests, avoiding nominal valueOf conflicts.
 *
 * @public
 */
export type MockOverrides<T> = Partial<Omit<T, 'valueOf' | 'toString'>> & {
  valueOf?: () => unknown;
  toString?: () => string;
} & Record<string, unknown>;

/**
 * Creates a stubbed Discord {@link User} object for unit tests.
 *
 * @param overrides - Optional property overrides.
 * @returns A mocked Discord User instance.
 *
 * @public
 */
export function createMockUser(overrides: MockOverrides<User> = {}): User {
  const id = (overrides.id as string | undefined) ?? nextSnowflake();
  const username = (overrides.username as string | undefined) ?? `user_${id.slice(-4)}`;
  return {
    id,
    bot: false,
    system: false,
    username,
    discriminator: '0',
    globalName: username,
    tag: `${username}#0000`,
    avatar: null,
    avatarURL: () => null,
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    toString: () => `<@${id}>`,
    ...overrides,
  } as unknown as User;
}

/**
 * Creates a stubbed Discord {@link Guild} object for unit tests.
 *
 * @param overrides - Optional property overrides.
 * @returns A mocked Discord Guild instance.
 *
 * @public
 */
export function createMockGuild(overrides: MockOverrides<Guild> = {}): Guild {
  const id = (overrides.id as string | undefined) ?? nextSnowflake();
  const name = (overrides.name as string | undefined) ?? `Test Guild ${id.slice(-4)}`;
  return {
    id,
    name,
    icon: null,
    available: true,
    memberCount: 42,
    toString: () => name,
    ...overrides,
  } as unknown as Guild;
}

/**
 * Creates a stubbed Discord {@link GuildMember} object for unit tests.
 *
 * @param overrides - Optional property overrides.
 * @returns A mocked Discord GuildMember instance.
 *
 * @public
 */
export function createMockMember(overrides: MockOverrides<GuildMember> = {}): GuildMember {
  const user = (overrides.user as User | undefined) ?? createMockUser();
  const guild = (overrides.guild as Guild | undefined) ?? createMockGuild();
  const permissions =
    (overrides.permissions as PermissionsBitField | undefined) ??
    new PermissionsBitField([
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ViewChannel,
    ]);

  return {
    id: user.id,
    user,
    guild,
    nickname: null,
    displayName: user.globalName ?? user.username,
    permissions,
    roles: {
      cache: new Map(),
    },
    toString: () => `<@!${user.id}>`,
    ...overrides,
  } as unknown as GuildMember;
}

/**
 * Creates a stubbed Discord {@link TextChannel} object for unit tests.
 *
 * @param overrides - Optional property overrides.
 * @returns A mocked Discord TextChannel instance.
 *
 * @public
 */
export function createMockChannel(overrides: MockOverrides<TextChannel> = {}): TextChannel {
  const id = (overrides.id as string | undefined) ?? nextSnowflake();
  const name = (overrides.name as string | undefined) ?? `test-channel-${id.slice(-4)}`;
  return {
    id,
    name,
    isTextBased: () => true,
    isDMBased: () => false,
    send: async (payload: unknown) => ({
      id: nextSnowflake(),
      channelId: id,
      content: String(payload),
    }),
    toString: () => `<#${id}>`,
    ...overrides,
  } as unknown as TextChannel;
}

/**
 * Creates a stubbed Discord {@link Message} object for unit tests.
 *
 * @param overrides - Optional property overrides.
 * @returns A mocked Discord Message instance.
 *
 * @public
 */
export function createMockMessage(overrides: MockOverrides<Message> = {}): Message {
  const id = (overrides.id as string | undefined) ?? nextSnowflake();
  const author = (overrides.author as User | undefined) ?? createMockUser();
  const channel = (overrides.channel as TextChannel | undefined) ?? createMockChannel();
  return {
    id,
    content: 'Hello, world!',
    author,
    channel,
    guild: (overrides.guild as Guild | undefined) ?? createMockGuild(),
    createdAt: new Date(),
    createdTimestamp: Date.now(),
    reply: async (payload: unknown) => ({ id: nextSnowflake(), content: String(payload) }),
    ...overrides,
  } as unknown as Message;
}
