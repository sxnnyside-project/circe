import { ComponentRegistry } from "../discord/components/registry.js";
import { handleComponentInteraction } from "../discord/components/router.js";
import type { ComponentDefinition } from "../discord/components/types.js";
import type { LogEntry } from "../logging/logger.js";
import { createTestComponentInteraction, type TestComponentInteractionOptions, type TestReply } from "./interaction.js";
import { createTestLogger } from "./logger.js";

export interface TestComponentResult {
  replies: TestReply[];
  followUps: TestReply[];
  /** Every `interaction.update()` call, in order — the usual way a component handler responds. */
  updates: TestReply[];
  logs: LogEntry[];
}

/**
 * Runs a button/select-menu interaction through Circe's real routing
 * path — `parse()`, `execute()`, and the central error boundary — exactly
 * as `attachComponentRouter` would, against a fabricated interaction
 * instead of a live one. Mirrors `testCommand`/`testModal`: this exercises
 * the actual `handleComponentInteraction` code Circe ships.
 */
export async function testComponent<
  Metadata extends Record<string, unknown> = Record<string, never>,
  Params = undefined,
>(
  component: ComponentDefinition<Metadata, Params>,
  options: TestComponentInteractionOptions = {},
): Promise<TestComponentResult> {
  const registry = new ComponentRegistry();
  registry.register(component);

  const { logger, entries } = createTestLogger();
  const { interaction, replies, followUps, updates } = createTestComponentInteraction({
    customId: component.prefix,
    ...options,
  });

  await handleComponentInteraction(interaction, { registry, logger });

  return { replies, followUps, updates, logs: entries };
}
