/**
 * Circe's testing entry point: `import { ... } from "circe/testing"`.
 *
 * Scope is deliberately narrow — this mocks only the exact surface Circe's
 * own router/dispatcher read (see `interaction.ts`), not discord.js as a
 * whole. For correlation-context assertions, use `withCorrelationId`/
 * `getCorrelationId` from the main `circe` entry point directly; they're
 * already public and don't need a test-only wrapper.
 */

export type { TestCommandResult } from './command.js';
export { testCommand } from './command.js';
export type { TestComponentResult } from './component.js';
export { testComponent } from './component.js';
export type { TestContextOptions } from './context.js';
export { createTestContext } from './context.js';
export type { TestEventResult } from './event.js';
export { testEvent } from './event.js';
export type {
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
} from './interaction.js';
export type { TestLogger } from './logger.js';
export { createTestLogger } from './logger.js';
export type { TestModalResult } from './modal.js';
export { testModal } from './modal.js';
