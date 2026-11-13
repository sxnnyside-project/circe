/**
 * Circe testing framework entry point: `import { ... } from "@sxnnyside/circe/testing"`.
 *
 * @remarks
 * Provides an isolated, zero-network test kit to test bots implemented on Circe:
 * - Direct execution and full router testing for commands, subcommands, components, modals, context menus, and autocompletes.
 * - Access control guard evaluation.
 * - Discord event testing with unhandled error isolation.
 * - Fluent assertion helpers for replies, ephemeral flags, follow-ups, updates, modals, and logs.
 * - Deterministic Discord mock objects (`User`, `Guild`, `Member`, `Channel`, `Message`).
 *
 * @packageDocumentation
 */

export type {
  TestAutocompleteOptions,
  TestAutocompleteResult,
  TestFocusedOption,
} from './autocomplete.js';
export { testAutocomplete } from './autocomplete.js';
export type { TestCommandOptions, TestCommandResult } from './command.js';
export { testCommand } from './command.js';
export type { TestComponentOptions, TestComponentResult } from './component.js';
export { testComponent } from './component.js';
export type { TestContextOptions } from './context.js';
export { createTestContext } from './context.js';
export type {
  TestContextMenuInteractionOptions,
  TestContextMenuOptions,
  TestContextMenuResult,
} from './context-menu.js';
export {
  createTestContextMenuInteraction,
  testContextMenu,
} from './context-menu.js';
export type { TestEventResult } from './event.js';
export { testEvent } from './event.js';
export type { TestGuardOptions, TestGuardResult } from './guard.js';
export { testGuard } from './guard.js';
export type {
  RawReply,
  TestComponentInteraction,
  TestComponentInteractionOptions,
  TestInteraction,
  TestInteractionOptions,
  TestModalInteraction,
  TestModalInteractionOptions,
  TestReply,
} from './interaction.js';
export {
  createTestComponentInteraction,
  createTestInteraction,
  createTestModalInteraction,
  toTestReply,
} from './interaction.js';
export type { TestLogger } from './logger.js';
export { createTestLogger } from './logger.js';
export type { MockOverrides } from './mock.js';
export {
  createMockChannel,
  createMockGuild,
  createMockMember,
  createMockMessage,
  createMockUser,
} from './mock.js';
export type { TestModalOptions, TestModalResult } from './modal.js';
export { testModal } from './modal.js';
export type { TestExecutionResult } from './result.js';
export { createTestExecutionResult } from './result.js';
