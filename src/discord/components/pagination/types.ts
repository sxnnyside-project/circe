import type { EmbedBuilder } from "discord.js";

export interface PaginatorPage {
  readonly content?: string;
  readonly embeds?: EmbedBuilder[];
  /** Label shown for this page in the page-select dropdown, when enabled. Defaults to `"Page N"`. */
  readonly label?: string;
}

export interface PaginationSession {
  readonly pages: readonly PaginatorPage[];
  readonly index: number;
}

/**
 * Backing store for active paginator sessions, keyed by a random session
 * id embedded in each button's `customId`. Circe ships `MemoryPaginationStore`;
 * a bot that needs sessions shared across processes implements this
 * itself, same relationship as `CooldownStore`.
 */
export interface PaginationStore {
  get(sessionId: string): PaginationSession | undefined;
  set(sessionId: string, session: PaginationSession, ttlMs: number): void;
  delete(sessionId: string): void;
}
