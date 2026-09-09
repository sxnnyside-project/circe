import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  ModalSubmitInteraction,
  User,
} from "discord.js";

export interface TestReply {
  content: string;
  ephemeral?: boolean;
}

export interface TestInteractionOptions {
  commandName?: string;
  /** Defaults to a minimal stub guild. Pass `null` to simulate a DM/non-guild interaction. */
  guild?: Guild | null;
  /** Defaults to `null` — most commands under test don't need a real cached member. */
  member?: GuildMember | null;
  user?: User;
  client?: Client;
  /** Defaults to `"en-US"` — the interaction's locale, read by `ctx.t(...)`. */
  locale?: string;
  /** For testing a `command-groups/` leaf: read back via `interaction.options.getSubcommand()`. */
  subcommand?: string;
  /** For testing a two-level `command-groups/` tree: read back via `interaction.options.getSubcommandGroup()`. */
  subcommandGroup?: string;
}

export interface TestInteraction {
  /** The fabricated interaction, typed as a real `ChatInputCommandInteraction` for use with Circe's router/commands. */
  interaction: ChatInputCommandInteraction;
  /** Every `reply()` call, in order. */
  replies: TestReply[];
  /** Every `followUp()` call, in order. */
  followUps: TestReply[];
}

/**
 * Builds the minimal interaction surface Circe's command router and
 * `CommandContext` actually read: `commandName`, `deferred`/`replied`,
 * `guild`, `member`, `user`, `client`, and `reply()`/`followUp()`. This is
 * not a discord.js mock — it implements nothing else, because nothing else
 * in Circe touches it. A command that reaches into interaction surface
 * beyond this (option values, `deferReply()`, etc.) needs a richer stub
 * built by hand for that test, same as any other unit test.
 */
export function createTestInteraction(options: TestInteractionOptions = {}): TestInteraction {
  const replies: TestReply[] = [];
  const followUps: TestReply[] = [];

  const interaction = {
    commandName: options.commandName ?? "test",
    deferred: false,
    replied: false,
    guild: options.guild === undefined ? ({ id: "test-guild" } as Guild) : options.guild,
    member: options.member ?? null,
    user: options.user ?? ({ id: "test-user", username: "test-user" } as User),
    client: options.client ?? ({} as Client),
    locale: options.locale ?? "en-US",
    options: {
      getSubcommand: (required?: boolean) => {
        if (options.subcommand === undefined && required !== false) {
          throw new Error("No test subcommand provided — pass `subcommand` to createTestInteraction/testCommand");
        }
        return options.subcommand ?? null;
      },
      getSubcommandGroup: () => options.subcommandGroup ?? null,
    },
    reply: async (payload: TestReply) => {
      interaction.replied = true;
      replies.push(payload);
    },
    followUp: async (payload: TestReply) => {
      followUps.push(payload);
    },
  };

  return { interaction: interaction as unknown as ChatInputCommandInteraction, replies, followUps };
}

export interface TestModalInteractionOptions {
  customId?: string;
  /** Field values keyed by the modal's `TextInputBuilder` customId — read back via `interaction.fields.getTextInputValue(id)`. */
  fields?: Record<string, string>;
  /** Defaults to a minimal stub guild. Pass `null` to simulate a DM/non-guild interaction. */
  guild?: Guild | null;
  /** Defaults to `null` — most modal handlers under test don't need a real cached member. */
  member?: GuildMember | null;
  user?: User;
  client?: Client;
  /** Defaults to `"en-US"` — the interaction's locale, read by `ctx.t(...)`. */
  locale?: string;
}

export interface TestModalInteraction {
  /** The fabricated interaction, typed as a real `ModalSubmitInteraction` for use with Circe's modal router. */
  interaction: ModalSubmitInteraction;
  /** Every `reply()` call, in order. */
  replies: TestReply[];
  /** Every `followUp()` call, in order. */
  followUps: TestReply[];
}

/**
 * Builds the minimal interaction surface Circe's modal router and
 * `ModalContext` actually read — `customId`, `fields.getTextInputValue()`,
 * `deferred`/`replied`, `guild`, `member`, `user`, `client`, and
 * `reply()`/`followUp()` — the same scope discipline as `createTestInteraction`.
 */
export function createTestModalInteraction(options: TestModalInteractionOptions = {}): TestModalInteraction {
  const replies: TestReply[] = [];
  const followUps: TestReply[] = [];
  const fields = options.fields ?? {};

  const interaction = {
    customId: options.customId ?? "test:",
    deferred: false,
    replied: false,
    guild: options.guild === undefined ? ({ id: "test-guild" } as Guild) : options.guild,
    member: options.member ?? null,
    user: options.user ?? ({ id: "test-user", username: "test-user" } as User),
    client: options.client ?? ({} as Client),
    locale: options.locale ?? "en-US",
    fields: {
      getTextInputValue: (customId: string) => {
        const value = fields[customId];
        if (value === undefined) {
          throw new Error(`No test value provided for modal field "${customId}"`);
        }
        return value;
      },
    },
    reply: async (payload: TestReply) => {
      interaction.replied = true;
      replies.push(payload);
    },
    followUp: async (payload: TestReply) => {
      followUps.push(payload);
    },
  };

  return { interaction: interaction as unknown as ModalSubmitInteraction, replies, followUps };
}

export interface TestComponentInteractionOptions {
  /** Defaults to `"test:"`. */
  customId?: string;
  /** Defaults to a minimal stub guild. Pass `null` to simulate a DM/non-guild interaction. */
  guild?: Guild | null;
  /** Defaults to `null` — most component handlers under test don't need a real cached member. */
  member?: GuildMember | null;
  user?: User;
  client?: Client;
  /** Defaults to `"en-US"` — the interaction's locale, read by `ctx.t(...)`. */
  locale?: string;
}

export interface TestComponentInteraction {
  /** The fabricated interaction, typed as a real `ButtonInteraction` for use with Circe's component router. */
  interaction: ButtonInteraction;
  /** Every `reply()` call, in order. */
  replies: TestReply[];
  /** Every `followUp()` call, in order. */
  followUps: TestReply[];
  /** Every `update()` call, in order — the usual way a component handler responds. */
  updates: TestReply[];
}

/**
 * Builds the minimal interaction surface Circe's component router and
 * `ComponentContext` actually read — `customId`, `deferred`/`replied`,
 * `guild`, `member`, `user`, `client`, and `reply()`/`followUp()`/`update()` —
 * the same scope discipline as `createTestInteraction`. Typed as a
 * `ButtonInteraction`; a select-menu handler that reads `.values` needs a
 * richer stub built by hand, same as any interaction surface beyond this.
 */
export function createTestComponentInteraction(
  options: TestComponentInteractionOptions = {},
): TestComponentInteraction {
  const replies: TestReply[] = [];
  const followUps: TestReply[] = [];
  const updates: TestReply[] = [];

  const interaction = {
    customId: options.customId ?? "test:",
    deferred: false,
    replied: false,
    guild: options.guild === undefined ? ({ id: "test-guild" } as Guild) : options.guild,
    member: options.member ?? null,
    user: options.user ?? ({ id: "test-user", username: "test-user" } as User),
    client: options.client ?? ({} as Client),
    locale: options.locale ?? "en-US",
    reply: async (payload: TestReply) => {
      interaction.replied = true;
      replies.push(payload);
    },
    followUp: async (payload: TestReply) => {
      followUps.push(payload);
    },
    update: async (payload: TestReply) => {
      updates.push(payload);
    },
  };

  return { interaction: interaction as unknown as ButtonInteraction, replies, followUps, updates };
}
