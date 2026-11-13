import type { APIEmbed, EmbedBuilder } from 'discord.js';

/**
 * An individual page within a paginated carousel.
 *
 * @public
 */
export interface PaginatorPage {
  /** Optional message text content for this page. */
  readonly content?: string;
  /** Optional embeds displayed on this page, as discord.js builders or plain API objects. */
  readonly embeds?: (EmbedBuilder | APIEmbed)[];
  /**
   * Label shown for this page in the optional page-select dropdown menu.
   * @defaultValue `"Page N"`
   */
  readonly label?: string;
}

/**
 * A {@link PaginatorPage} reduced to plain JSON, which is what a {@link PaginationStore} keeps.
 *
 * @remarks
 * Embeds are stored as API objects rather than builders, so any store that can hold JSON
 * (Redis, a database row) works, and a click may be handled by a different process than the reply.
 *
 * @public
 */
export interface SerializedPaginatorPage {
  /** Message text content for this page. */
  readonly content?: string;
  /** Embeds for this page as API objects. */
  readonly embeds?: APIEmbed[];
  /** Label for this page in the page-select dropdown. */
  readonly label?: string;
}

/**
 * Active paginator state for a specific message session. Plain JSON, safe to serialize.
 *
 * @public
 */
export interface PaginationSession {
  /** The sequence of all pages in the paginator session. */
  readonly pages: readonly SerializedPaginatorPage[];
  /** Current active zero-based page index. */
  readonly index: number;
  /**
   * Epoch milliseconds at which the session goes idle. Each interaction pushes it forward, so a
   * process holding an older disable timer can tell that another process kept the session alive.
   */
  readonly idleUntil: number;
}

/**
 * Backing storage interface for active paginator sessions.
 *
 * @public
 */
export interface PaginationStore {
  /**
   * Retrieves an active session by its unique session ID.
   *
   * @param sessionId - Unique session UUID.
   * @returns The active session state, or `undefined` if expired or missing.
   */
  get(sessionId: string): PaginationSession | undefined | Promise<PaginationSession | undefined>;

  /**
   * Stores or updates a session with an idle time-to-live.
   *
   * @param sessionId - Unique session UUID.
   * @param session - The session state.
   * @param ttlMs - Time-to-live in milliseconds before expiry.
   */
  set(sessionId: string, session: PaginationSession, ttlMs: number): void | Promise<void>;

  /**
   * Deletes an expired or cancelled session.
   *
   * @param sessionId - Unique session UUID.
   */
  delete(sessionId: string): void | Promise<void>;
}
