import type { ChatInputCommandInteraction, Client, Guild, GuildMember, ModalSubmitInteraction, User } from "discord.js";

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
