import type { Client, Guild, GuildMember, ModalSubmitInteraction, User } from "discord.js";
import type { Logger } from "../../logging/logger.js";

export interface ModalContext {
  /** The raw discord.js interaction — never hidden behind a Circe wrapper. */
  readonly interaction: ModalSubmitInteraction;
  readonly client: Client;
  readonly guild: Guild | null;
  /** `null` when the interaction did not originate in a guild, or the member wasn't cached. */
  readonly member: GuildMember | null;
  readonly user: User;
  readonly logger: Logger;
  readonly correlationId: string | undefined;
}

export interface ModalDefinition<Metadata extends Record<string, unknown> = Record<string, never>> {
  /**
   * Matches any modal submission whose `customId` starts with this string.
   * Same longest-prefix-match resolution as component routing.
   */
  readonly prefix: string;
  /** Same bot-owned metadata bag as `ComponentDefinition.metadata` — Circe never reads it. */
  readonly metadata?: Metadata;
  execute(ctx: ModalContext): void | Promise<void>;
}

/** Identity helper — exists purely for type inference/ergonomics at the call site. */
export function defineModal<Metadata extends Record<string, unknown> = Record<string, never>>(
  definition: ModalDefinition<Metadata>,
): ModalDefinition<Metadata> {
  return definition;
}
