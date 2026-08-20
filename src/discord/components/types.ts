import type { ButtonInteraction, Client, Guild, GuildMember, StringSelectMenuInteraction, User } from "discord.js";
import type { Logger } from "../../logging/logger.js";

/** The message component interaction types Circe routes. Modals and context menus are out of scope. */
export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction;

export interface ComponentContext<Interaction extends ComponentInteraction = ComponentInteraction, Params = undefined> {
  /** The raw discord.js interaction — never hidden behind a Circe wrapper. */
  readonly interaction: Interaction;
  readonly client: Client;
  readonly guild: Guild | null;
  /** `null` when the interaction did not originate in a guild, or the member wasn't cached. */
  readonly member: GuildMember | null;
  readonly user: User;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
  /**
   * The result of this component's `parse(customId)`, if it defines one.
   * `undefined` for components that route on the prefix alone — parsing a
   * structured customId (e.g. an encoded track reference) is opt-in, not a
   * routing requirement.
   */
  readonly params: Params;
}

export interface ComponentDefinition<
  Metadata extends Record<string, unknown> = Record<string, never>,
  Params = undefined,
> {
  /**
   * Matches any component interaction whose `customId` starts with this
   * string. When more than one registered prefix matches, the longest
   * (most specific) one wins — registration order never affects resolution.
   */
  readonly prefix: string;
  /** Same bot-owned metadata bag as `CommandDefinition.metadata` — Circe never reads it. */
  readonly metadata?: Metadata;
  /**
   * Optional structured-parameter extraction, run once per interaction
   * before `execute`. Circe only supplies the routing mechanism (prefix
   * match, then this callback on the full `customId`) — parsing/encoding
   * logic itself stays consumer-owned, same as `CommandBuilder` option
   * definitions. A parser that throws surfaces through the normal
   * component error boundary, same as `execute` throwing.
   */
  parse?(customId: string): Params;
  execute(ctx: ComponentContext<ComponentInteraction, Params>): void | Promise<void>;
}

/** Identity helper — exists purely for type inference/ergonomics at the call site. */
export function defineComponent<Metadata extends Record<string, unknown> = Record<string, never>, Params = undefined>(
  definition: ComponentDefinition<Metadata, Params>,
): ComponentDefinition<Metadata, Params> {
  return definition;
}
