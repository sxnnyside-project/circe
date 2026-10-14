import { ModalRegistry } from '../discord/modals/registry.js';
import { handleModalInteraction } from '../discord/modals/router.js';
import type { ModalDefinition } from '../discord/modals/types.js';
import type { LogEntry } from '../logging/logger.js';
import {
  createTestModalInteraction,
  type TestModalInteractionOptions,
  type TestReply,
} from './interaction.js';
import { createTestLogger } from './logger.js';

export interface TestModalResult {
  replies: TestReply[];
  followUps: TestReply[];
  logs: LogEntry[];
}

/**
 * Runs a modal submission through Circe's real routing path —
 * `execute()` and the central error boundary — exactly as
 * `attachModalRouter` would, against a fabricated interaction instead of a
 * live one. Mirrors `testCommand`: this exercises the actual
 * `handleModalInteraction` code Circe ships, not a reimplementation of it.
 */
export async function testModal(
  modal: ModalDefinition,
  options: TestModalInteractionOptions = {},
): Promise<TestModalResult> {
  const registry = new ModalRegistry();
  registry.register(modal);

  const { logger, entries } = createTestLogger();
  const { interaction, replies, followUps } = createTestModalInteraction({
    customId: modal.prefix,
    ...options,
  });

  await handleModalInteraction(interaction, { registry, logger });

  return { replies, followUps, logs: entries };
}
