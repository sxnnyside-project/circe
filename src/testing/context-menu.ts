import type {
  GuildMember,
  Message,
  MessageContextMenuCommandInteraction,
  User,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import type { ContextMenuCommandError } from '../discord/context-menus/errors.js';
import { ContextMenuCommandRegistry } from '../discord/context-menus/registry.js';
import {
  type ContextMenuCommandRouterOptions,
  handleContextMenuInteraction,
} from '../discord/context-menus/router.js';
import type {
  MessageCommandDefinition,
  MessageContextMenuCommandContext,
  MessageContextMenuCommandDefinition,
  UserCommandDefinition,
  UserContextMenuCommandContext,
  UserContextMenuCommandDefinition,
} from '../discord/context-menus/types.js';
import type { LocalizationResolver } from '../localization/resolver.js';
import type { InteractionTelemetryHandler } from '../observability/metrics.js';
import type { ErrorReporter } from '../observability/report-error.js';
import {
  createTestInteraction,
  type TestInteractionOptions,
  type TestReply,
} from './interaction.js';
import { createTestLogger } from './logger.js';
import { createMockMessage, createMockUser } from './mock.js';
import { createTestExecutionResult, type TestExecutionResult } from './result.js';

/**
 * Options for configuring a stubbed context menu interaction.
 *
 * @public
 */
export interface TestContextMenuInteractionOptions extends TestInteractionOptions {
  /** Type of context menu: user or message. */
  readonly targetType?: 'user' | 'message';
  /** Target user for user context menus. */
  readonly targetUser?: User;
  /** Target member for user context menus in guilds. */
  readonly targetMember?: GuildMember | null;
  /** Target message for message context menus. */
  readonly targetMessage?: Message;
}

/**
 * Options for running a context menu command under test.
 *
 * @public
 */
export interface TestContextMenuOptions extends TestContextMenuInteractionOptions {
  /** Custom localization resolver. */
  readonly i18n?: LocalizationResolver;
  /** Central error reporting callback. */
  readonly onError?: ErrorReporter;
  /** Custom callback invoked when a guard denies execution. */
  readonly onGuardDenied?: (
    ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
    reason: string,
  ) => void | Promise<void>;
  /** Custom callback invoked when context menu execution throws an unhandled error. */
  readonly onContextMenuCommandError?: (
    ctx: UserContextMenuCommandContext | MessageContextMenuCommandContext,
    error: ContextMenuCommandError,
  ) => void | Promise<void>;
  /** Observability callback invoked upon interaction completion. */
  readonly onInteractionComplete?: InteractionTelemetryHandler;
}

/**
 * Creates a fabricated {@link UserContextMenuCommandInteraction} or {@link MessageContextMenuCommandInteraction}
 * for isolated testing.
 *
 * @param options - Configuration options for the stubbed interaction.
 * @returns An interaction stub, captured replies, and follow-ups.
 *
 * @public
 */
export function createTestContextMenuInteraction(options: TestContextMenuInteractionOptions = {}): {
  interaction: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction;
  replies: TestReply[];
  followUps: TestReply[];
} {
  const { interaction: base, replies, followUps } = createTestInteraction(options);
  const targetType = options.targetType ?? (options.targetMessage ? 'message' : 'user');

  const targetUser = options.targetUser ?? createMockUser();
  const targetMember = options.targetMember ?? (options.guild ? null : null);
  const targetMessage =
    options.targetMessage ?? createMockMessage({ guild: options.guild ?? null });

  const interaction = {
    ...base,
    isUserContextMenuCommand: () => targetType === 'user',
    isMessageContextMenuCommand: () => targetType === 'message',
    targetUser,
    targetMember,
    targetMessage,
  } as unknown as UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction;

  return { interaction, replies, followUps };
}

/**
 * Result of running a context menu command under test.
 *
 * @public
 */
export type TestContextMenuResult = TestExecutionResult;

/**
 * Executes a user or message context menu command through Circe's real router path.
 *
 * @remarks
 * Tests guards, execution, and error boundaries against a fabricated context menu interaction.
 *
 * @param command - The user or message context menu command definition.
 * @param options - Custom interaction and pipeline options.
 * @returns A promise resolving to an ergonomic {@link TestContextMenuResult}.
 *
 * @example
 * ```typescript
 * import { testContextMenu } from '@sxnnyside/circe/testing';
 * import bookmarkCommand from './bookmark.js';
 *
 * const result = await testContextMenu(bookmarkCommand);
 * expect(result.hasReply('Bookmarked')).toBe(true);
 * ```
 *
 * @public
 */
export async function testContextMenu(
  command:
    | UserCommandDefinition
    | MessageCommandDefinition
    | UserContextMenuCommandDefinition
    | MessageContextMenuCommandDefinition,
  options: TestContextMenuOptions = {},
): Promise<TestContextMenuResult> {
  const registry = new ContextMenuCommandRegistry();
  const targetType = options.targetType ?? ('targetMessage' in options ? 'message' : 'user');

  if (targetType === 'user') {
    registry.registerUser(command as UserCommandDefinition);
  } else {
    registry.registerMessage(command as MessageCommandDefinition);
  }

  const { logger, entries } = createTestLogger();
  const commandName =
    (command as { name?: string }).name ??
    (command as { builder?: { name: string } }).builder?.name ??
    'unknown';
  const { interaction, replies, followUps } = createTestContextMenuInteraction({
    commandName,
    targetType,
    ...options,
  });

  const routerOptions: ContextMenuCommandRouterOptions = {
    registry,
    logger,
    ...(options.i18n !== undefined && { i18n: options.i18n }),
    ...(options.onError !== undefined && { onError: options.onError }),
    ...(options.onGuardDenied !== undefined && { onGuardDenied: options.onGuardDenied }),
    ...(options.onContextMenuCommandError !== undefined && {
      onContextMenuCommandError: options.onContextMenuCommandError,
    }),
    ...(options.onInteractionComplete !== undefined && {
      onInteractionComplete: options.onInteractionComplete,
    }),
  };

  await handleContextMenuInteraction(interaction, routerOptions);

  return createTestExecutionResult({
    replies,
    followUps,
    logs: entries,
    isDeferred: interaction.deferred,
    isReplied: interaction.replied,
  });
}
