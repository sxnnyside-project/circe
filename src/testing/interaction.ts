import type {
  Attachment,
  BitFieldResolvable,
  ButtonInteraction,
  Channel,
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildBasedChannel,
  GuildMember,
  InteractionReplyOptions,
  Message,
  MessageFlagsString,
  ModalSubmitInteraction,
  Role,
  StringSelectMenuInteraction,
  User,
} from 'discord.js';
import { MessageFlags, MessageFlagsBitField } from 'discord.js';

/**
 * Normalized interaction reply payload recorded during unit tests.
 *
 * @remarks
 * Normalizes different flag formats (raw number, bitfield, array) into a single standard representation.
 *
 * @public
 */
export interface TestReply {
  /** The text content or embed summary of the reply. */
  content: string;
  /** Whether the message was marked ephemeral. */
  ephemeral?: boolean;
  /** Message flags other than `Ephemeral` (which is extracted into {@link ephemeral}). */
  flags?: number;
}

/**
 * Raw reply payload accepted by Discord.js interaction methods.
 *
 * @public
 */
export type RawReply = (Omit<InteractionReplyOptions, 'flags'> | { content: string }) & {
  flags?: BitFieldResolvable<MessageFlagsString, number>;
  ephemeral?: boolean;
};

/**
 * Normalizes raw Discord reply options into a consistent {@link TestReply}.
 *
 * @param payload - Raw string or reply options object.
 * @returns A standardized {@link TestReply}.
 *
 * @internal
 */
export function toTestReply(payload: RawReply | string): TestReply {
  if (typeof payload !== 'object') {
    return payload as unknown as TestReply;
  }
  const { flags, ephemeral, content, ...rest } = payload as RawReply & { content?: string };
  const textContent = content ?? '';

  if (flags === undefined) {
    return ephemeral
      ? { ...rest, content: textContent, ephemeral: true }
      : { ...rest, content: textContent };
  }

  const resolved = new MessageFlagsBitField(flags);
  const isEphemeral = Boolean(ephemeral) || resolved.has(MessageFlags.Ephemeral);

  if (!isEphemeral) {
    return { ...rest, content: textContent, flags: resolved.bitfield };
  }

  const remaining = resolved.remove(MessageFlags.Ephemeral);
  return remaining.bitfield === 0
    ? { ...rest, content: textContent, ephemeral: true }
    : { ...rest, content: textContent, ephemeral: true, flags: remaining.bitfield };
}

/**
 * Configuration options for creating a fabricated command interaction.
 *
 * @public
 */
export interface TestInteractionOptions {
  /** The slash command name (e.g. `'ping'`). Default: `'test'`. */
  readonly commandName?: string;
  /** Custom options map accessible via `interaction.options.get*()`. */
  readonly options?: Record<string, unknown>;
  /** Guild instance, or `null` to simulate a Direct Message. Default: stub guild. */
  readonly guild?: Guild | null;
  /** Guild member instance. Default: `null`. */
  readonly member?: GuildMember | null;
  /** The user who triggered the interaction. Default: stub user. */
  readonly user?: User;
  /** The Discord client instance. Default: empty stub client. */
  readonly client?: Client;
  /** Locale string of the invoking user (e.g. `'en-US'`). Default: `'en-US'`. */
  readonly locale?: string;
  /** Subcommand name for testing `command-groups/` leaves. */
  readonly subcommand?: string;
  /** Subcommand group name for testing two-level hierarchical command trees. */
  readonly subcommandGroup?: string;
}

/**
 * Fabricated interaction handle for slash command testing.
 *
 * @public
 */
export interface TestInteraction {
  /** The fabricated interaction typed as {@link ChatInputCommandInteraction}. */
  readonly interaction: ChatInputCommandInteraction;
  /** All recorded replies from `reply()` and `editReply()`. */
  readonly replies: TestReply[];
  /** All recorded follow-up messages from `followUp()`. */
  readonly followUps: TestReply[];
  /** All modals opened via `showModal()`. */
  readonly modals: unknown[];
}

/**
 * Builds standard Discord.js `CommandInteractionOptionResolver` stub methods.
 *
 * @param options - Dictionary of option values.
 * @param subcommand - Subcommand name, if any.
 * @param subcommandGroup - Subcommand group name, if any.
 *
 * @internal
 */
function createOptionResolver(
  options: Record<string, unknown>,
  subcommand?: string,
  subcommandGroup?: string,
) {
  const getOption = (name: string, required?: boolean) => {
    const val = options[name];
    if (val === undefined && required) {
      throw new Error(`Required option "${name}" was not provided in test options`);
    }
    return val;
  };

  return {
    getSubcommand: (required?: boolean) => {
      if (subcommand === undefined && required !== false) {
        throw new Error('No test subcommand provided — pass `subcommand` in test options');
      }
      return subcommand ?? null;
    },
    getSubcommandGroup: () => subcommandGroup ?? null,
    getString: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return val !== undefined ? String(val) : null;
    },
    getInteger: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return val !== undefined ? Math.trunc(Number(val)) : null;
    },
    getNumber: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return val !== undefined ? Number(val) : null;
    },
    getBoolean: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return val !== undefined ? Boolean(val) : null;
    },
    getUser: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return (val as User) ?? null;
    },
    getMember: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return (val as GuildMember) ?? null;
    },
    getChannel: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return (val as Channel | GuildBasedChannel) ?? null;
    },
    getRole: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return (val as Role) ?? null;
    },
    getMentionable: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return (val as User | GuildMember | Role) ?? null;
    },
    getAttachment: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      return (val as Attachment) ?? null;
    },
    get: (name: string, required?: boolean) => {
      const val = getOption(name, required);
      if (val === undefined) return null;
      return { name, value: val };
    },
  };
}

/**
 * Builds a fabricated {@link ChatInputCommandInteraction} for isolated unit testing.
 *
 * @remarks
 * Implements the full lifecycle surface read by Circe routers:
 * - Option parsing (`getString`, `getInteger`, `getBoolean`, `getUser`, `getChannel`, etc.)
 * - Subcommand routing (`getSubcommand`, `getSubcommandGroup`)
 * - Reply handling (`reply`, `deferReply`, `editReply`, `deleteReply`, `followUp`)
 * - Modal display (`showModal`)
 *
 * @param options - Configuration options for the stub.
 * @returns A {@link TestInteraction} handle containing interaction, replies, follow-ups, and modals.
 *
 * @example
 * ```typescript
 * const { interaction, replies } = createTestInteraction({
 *   commandName: 'greet',
 *   options: { target: 'World' },
 * });
 * ```
 *
 * @public
 */
export function createTestInteraction(options: TestInteractionOptions = {}): TestInteraction {
  const replies: TestReply[] = [];
  const followUps: TestReply[] = [];
  const modals: unknown[] = [];
  const optValues = options.options ?? {};

  const interaction = {
    commandName: options.commandName ?? 'test',
    deferred: false,
    replied: false,
    guild: options.guild === undefined ? ({ id: 'test-guild' } as Guild) : options.guild,
    member: options.member ?? null,
    user: options.user ?? ({ id: 'test-user', username: 'test-user' } as User),
    client: options.client ?? ({} as Client),
    locale: options.locale ?? 'en-US',
    options: createOptionResolver(optValues, options.subcommand, options.subcommandGroup),
    deferReply: async (opts?: { ephemeral?: boolean }) => {
      interaction.deferred = true;
      if (opts?.ephemeral) {
        replies.push({ content: '', ephemeral: true });
      }
    },
    reply: async (payload: RawReply | string) => {
      interaction.replied = true;
      replies.push(toTestReply(payload));
    },
    editReply: async (payload: RawReply | string) => {
      interaction.replied = true;
      const normalized = toTestReply(payload);
      if (replies.length > 0 && typeof replies[0] === 'object' && replies[0]?.content === '') {
        const wasEphemeral = replies[0]?.ephemeral;
        if (typeof normalized === 'object') {
          replies[0] = { ...normalized, ...(wasEphemeral && { ephemeral: true }) };
        } else {
          replies[0] = wasEphemeral
            ? ({ content: String(normalized), ephemeral: true } as TestReply)
            : normalized;
        }
      } else {
        replies.push(normalized);
      }
      return normalized as unknown as Message;
    },
    deleteReply: async () => {
      replies.length = 0;
    },
    followUp: async (payload: RawReply | string) => {
      followUps.push(toTestReply(payload));
      return toTestReply(payload) as unknown as Message;
    },
    showModal: async (modal: unknown) => {
      modals.push(modal);
    },
  };

  return {
    interaction: interaction as unknown as ChatInputCommandInteraction,
    replies,
    followUps,
    modals,
  };
}

/**
 * Options for creating a stubbed modal submit interaction.
 *
 * @public
 */
export interface TestModalInteractionOptions {
  /** The modal customId prefix or identifier. Default: `'test:'`. */
  readonly customId?: string;
  /** Field values keyed by the modal's `TextInputBuilder` customId. */
  readonly fields?: Record<string, string>;
  /** Guild instance, or `null` to simulate a DM. Default: stub guild. */
  readonly guild?: Guild | null;
  /** Guild member instance. Default: `null`. */
  readonly member?: GuildMember | null;
  /** The submitting user. Default: stub user. */
  readonly user?: User;
  /** The Discord client instance. Default: empty stub client. */
  readonly client?: Client;
  /** Locale string. Default: `'en-US'`. */
  readonly locale?: string;
}

/**
 * Fabricated interaction handle for modal submit testing.
 *
 * @public
 */
export interface TestModalInteraction {
  /** The fabricated interaction typed as {@link ModalSubmitInteraction}. */
  readonly interaction: ModalSubmitInteraction;
  /** All recorded replies. */
  readonly replies: TestReply[];
  /** All recorded follow-up messages. */
  readonly followUps: TestReply[];
}

/**
 * Builds a fabricated {@link ModalSubmitInteraction} for modal testing.
 *
 * @param options - Configuration options for the stub.
 * @returns A {@link TestModalInteraction} handle.
 *
 * @public
 */
export function createTestModalInteraction(
  options: TestModalInteractionOptions = {},
): TestModalInteraction {
  const replies: TestReply[] = [];
  const followUps: TestReply[] = [];
  const fields = options.fields ?? {};

  const interaction = {
    customId: options.customId ?? 'test:',
    deferred: false,
    replied: false,
    guild: options.guild === undefined ? ({ id: 'test-guild' } as Guild) : options.guild,
    member: options.member ?? null,
    user: options.user ?? ({ id: 'test-user', username: 'test-user' } as User),
    client: options.client ?? ({} as Client),
    locale: options.locale ?? 'en-US',
    fields: {
      getTextInputValue: (customId: string) => {
        const value = fields[customId];
        if (value === undefined) {
          throw new Error(`No test value provided for modal field "${customId}"`);
        }
        return value;
      },
    },
    deferReply: async (opts?: { ephemeral?: boolean }) => {
      interaction.deferred = true;
      if (opts?.ephemeral) {
        replies.push({ content: '', ephemeral: true });
      }
    },
    reply: async (payload: RawReply | string) => {
      interaction.replied = true;
      replies.push(toTestReply(payload));
    },
    editReply: async (payload: RawReply | string) => {
      interaction.replied = true;
      const normalized = toTestReply(payload);
      if (replies.length > 0 && typeof replies[0] === 'object' && replies[0]?.content === '') {
        const wasEphemeral = replies[0]?.ephemeral;
        if (typeof normalized === 'object') {
          replies[0] = { ...normalized, ...(wasEphemeral && { ephemeral: true }) };
        } else {
          replies[0] = wasEphemeral
            ? ({ content: String(normalized), ephemeral: true } as TestReply)
            : normalized;
        }
      } else {
        replies.push(normalized);
      }
      return normalized as unknown as Message;
    },
    deleteReply: async () => {
      replies.length = 0;
    },
    followUp: async (payload: RawReply | string) => {
      followUps.push(toTestReply(payload));
      return toTestReply(payload) as unknown as Message;
    },
  };

  return { interaction: interaction as unknown as ModalSubmitInteraction, replies, followUps };
}

/**
 * Configuration options for creating a fabricated component interaction.
 *
 * @public
 */
export interface TestComponentInteractionOptions {
  /** The component customId. Default: `'test:'`. */
  readonly customId?: string;
  /** Selected option values for select-menu component handlers. Default: `[]`. */
  readonly values?: readonly string[];
  /** Guild instance, or `null` to simulate a DM. Default: stub guild. */
  readonly guild?: Guild | null;
  /** Guild member instance. Default: `null`. */
  readonly member?: GuildMember | null;
  /** The interacting user. Default: stub user. */
  readonly user?: User;
  /** The Discord client instance. Default: empty stub client. */
  readonly client?: Client;
  /** Locale string. Default: `'en-US'`. */
  readonly locale?: string;
  /** The message the component sits on. */
  readonly message?: { interactionMetadata?: { user: { id: string } } | null };
}

/**
 * Fabricated interaction handle for button and select menu component testing.
 *
 * @public
 */
export interface TestComponentInteraction {
  /** The fabricated interaction typed as button or select menu interaction. */
  readonly interaction: (ButtonInteraction | StringSelectMenuInteraction) & {
    readonly values: string[];
  };
  /** All recorded replies from `reply()`. */
  readonly replies: TestReply[];
  /** All recorded follow-up messages from `followUp()`. */
  readonly followUps: TestReply[];
  /** All recorded updates from `update()`. */
  readonly updates: TestReply[];
  /** All modals opened via `showModal()`. */
  readonly modals: unknown[];
}

/**
 * Builds a fabricated {@link ButtonInteraction} for component handler testing.
 *
 * @remarks
 * Supports both buttons and select menus (via the {@link TestComponentInteractionOptions.values} option),
 * lifecycle operations (`update`, `reply`, `deferUpdate`, `deferReply`, `editReply`, `showModal`).
 *
 * @param options - Configuration options for the stub.
 * @returns A {@link TestComponentInteraction} handle.
 *
 * @public
 */
export function createTestComponentInteraction(
  options: TestComponentInteractionOptions = {},
): TestComponentInteraction {
  const replies: TestReply[] = [];
  const followUps: TestReply[] = [];
  const updates: TestReply[] = [];
  const modals: unknown[] = [];
  const values = options.values ? [...options.values] : [];

  const interaction = {
    customId: options.customId ?? 'test:',
    values,
    deferred: false,
    replied: false,
    guild: options.guild === undefined ? ({ id: 'test-guild' } as Guild) : options.guild,
    member: options.member ?? null,
    user: options.user ?? ({ id: 'test-user', username: 'test-user' } as User),
    client: options.client ?? ({} as Client),
    locale: options.locale ?? 'en-US',
    message: options.message ?? null,
    isButton: () => values.length === 0,
    isAnySelectMenu: () => values.length > 0,
    isStringSelectMenu: () => values.length > 0,
    deferReply: async (opts?: { ephemeral?: boolean }) => {
      interaction.deferred = true;
      if (opts?.ephemeral) {
        replies.push({ content: '', ephemeral: true });
      }
    },
    deferUpdate: async () => {
      interaction.deferred = true;
    },
    reply: async (payload: RawReply | string) => {
      interaction.replied = true;
      replies.push(toTestReply(payload));
    },
    editReply: async (payload: RawReply | string) => {
      interaction.replied = true;
      const normalized = toTestReply(payload);
      if (replies.length > 0 && typeof replies[0] === 'object' && replies[0]?.content === '') {
        const wasEphemeral = replies[0]?.ephemeral;
        if (typeof normalized === 'object') {
          replies[0] = { ...normalized, ...(wasEphemeral && { ephemeral: true }) };
        } else {
          replies[0] = wasEphemeral
            ? ({ content: String(normalized), ephemeral: true } as TestReply)
            : normalized;
        }
      } else {
        replies.push(normalized);
      }
      return normalized as unknown as Message;
    },
    deleteReply: async () => {
      replies.length = 0;
    },
    followUp: async (payload: RawReply | string) => {
      followUps.push(toTestReply(payload));
      return toTestReply(payload) as unknown as Message;
    },
    update: async (payload: RawReply | string) => {
      interaction.replied = true;
      updates.push(toTestReply(payload));
    },
    showModal: async (modal: unknown) => {
      modals.push(modal);
    },
  };

  return {
    interaction: interaction as unknown as (ButtonInteraction | StringSelectMenuInteraction) & {
      readonly values: string[];
    },
    replies,
    followUps,
    updates,
    modals,
  };
}
