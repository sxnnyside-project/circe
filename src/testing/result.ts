import type { LogEntry, LogLevel } from '../logging/logger.js';
import type { TestReply } from './interaction.js';

/**
 * Enhanced interaction test execution result providing fluent assertion and inspection helpers.
 *
 * @remarks
 * Encapsulates all side effects produced during interaction execution:
 * - Direct replies (`interaction.reply()`) and deferred edits (`interaction.editReply()`)
 * - Follow-up messages (`interaction.followUp()`)
 * - Modals opened (`interaction.showModal()`)
 * - Diagnostic log entries emitted by the interaction logger
 *
 * @public
 */
export interface TestExecutionResult {
  /** All standard replies recorded during the interaction lifecycle. */
  readonly replies: readonly TestReply[];
  /** All follow-up replies recorded during the interaction lifecycle. */
  readonly followUps: readonly TestReply[];
  /** All structured log entries emitted by the interaction logger. */
  readonly logs: readonly LogEntry[];
  /** All modal objects passed to `interaction.showModal()`. */
  readonly modals: readonly unknown[];
  /** The first reply recorded, or `undefined` if none was sent. */
  readonly reply: TestReply | undefined;
  /** The first follow-up recorded, or `undefined` if none was sent. */
  readonly followUp: TestReply | undefined;
  /** Whether the interaction was deferred via `deferReply()` or `deferUpdate()`. */
  readonly isDeferred: boolean;
  /** Whether the interaction was acknowledged or replied to. */
  readonly isReplied: boolean;

  /**
   * Asserts whether a reply matching the given substring, RegExp, or predicate was emitted.
   *
   * @param match - Target content substring, regular expression, or reply predicate.
   * @returns `true` if at least one matching reply was recorded; otherwise `false`.
   */
  hasReply(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean;

  /**
   * Asserts whether an ephemeral reply matching the given criteria was emitted.
   *
   * @param match - Optional content substring, regular expression, or reply predicate.
   * @returns `true` if an ephemeral reply matching criteria was recorded; otherwise `false`.
   */
  hasEphemeralReply(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean;

  /**
   * Asserts whether a follow-up reply matching criteria was emitted.
   *
   * @param match - Optional content substring, regular expression, or predicate.
   * @returns `true` if a matching follow-up was recorded; otherwise `false`.
   */
  hasFollowUp(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean;

  /**
   * Asserts whether a modal matching the given customId or predicate was opened via `showModal()`.
   *
   * @param match - Optional customId string, regex, or modal predicate.
   * @returns `true` if a matching modal was shown; otherwise `false`.
   */
  hasModal(match?: string | RegExp | ((modal: unknown) => boolean)): boolean;

  /**
   * Asserts whether a log entry at the specified log level was recorded.
   *
   * @param level - Expected log severity level.
   * @param messageMatch - Optional message substring or regular expression to match.
   * @returns `true` if a matching log entry exists; otherwise `false`.
   */
  hasLog(level: LogLevel, messageMatch?: string | RegExp): boolean;
}

function matchesReply(
  reply: TestReply,
  match?: string | RegExp | ((reply: TestReply) => boolean),
): boolean {
  if (match === undefined) return true;
  if (typeof match === 'function') return match(reply);
  const content = typeof reply === 'string' ? reply : (reply.content ?? '');
  if (typeof match === 'string') return content.includes(match);
  return match.test(content);
}

function matchesModal(
  modal: unknown,
  match?: string | RegExp | ((modal: unknown) => boolean),
): boolean {
  if (match === undefined) return true;
  if (typeof match === 'function') return match(modal);
  const customId =
    (modal as { data?: { custom_id?: string }; customId?: string })?.data?.custom_id ??
    (modal as { customId?: string })?.customId ??
    '';
  if (typeof match === 'string') return customId.includes(match);
  return match.test(customId);
}

/**
 * Creates an ergonomic {@link TestExecutionResult} wrapping replies, follow-ups, modals, and logs.
 *
 * @param data - The raw test recording arrays and lifecycle state.
 * @returns An object conforming to {@link TestExecutionResult}.
 *
 * @public
 */
export function createTestExecutionResult(data: {
  replies: TestReply[];
  followUps: TestReply[];
  logs: LogEntry[];
  modals?: unknown[];
  isDeferred?: boolean;
  isReplied?: boolean;
}): TestExecutionResult {
  const modals = data.modals ?? [];
  return {
    replies: data.replies,
    followUps: data.followUps,
    logs: data.logs,
    modals,
    get reply(): TestReply | undefined {
      const r = data.replies[0];
      if (r === undefined) return undefined;
      return typeof r === 'string' ? ({ content: r } as TestReply) : r;
    },
    get followUp(): TestReply | undefined {
      const f = data.followUps[0];
      if (f === undefined) return undefined;
      return typeof f === 'string' ? ({ content: f } as TestReply) : f;
    },
    get isDeferred(): boolean {
      return Boolean(data.isDeferred);
    },
    get isReplied(): boolean {
      return data.isReplied ?? data.replies.length > 0;
    },

    hasReply(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean {
      return data.replies.some((r) => matchesReply(r, match));
    },

    hasEphemeralReply(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean {
      return data.replies.some(
        (r) => typeof r === 'object' && Boolean(r.ephemeral) && matchesReply(r, match),
      );
    },

    hasFollowUp(match?: string | RegExp | ((reply: TestReply) => boolean)): boolean {
      return data.followUps.some((r) => matchesReply(r, match));
    },

    hasModal(match?: string | RegExp | ((modal: unknown) => boolean)): boolean {
      return modals.some((m) => matchesModal(m, match));
    },

    hasLog(level: LogLevel, messageMatch?: string | RegExp): boolean {
      return data.logs.some((l) => {
        if (l.level !== level) return false;
        if (messageMatch === undefined) return true;
        if (typeof messageMatch === 'string') return l.message.includes(messageMatch);
        return messageMatch.test(l.message);
      });
    },
  };
}
