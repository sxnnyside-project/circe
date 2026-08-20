import { type Client, Events, GuildMember, type Interaction } from "discord.js";
import { normalizeError } from "../../errors/normalize-error.js";
import { getCorrelationId, withCorrelationId } from "../../logging/context.js";
import type { Logger } from "../../logging/logger.js";
import { ComponentError } from "./errors.js";
import type { ComponentRegistry } from "./registry.js";
import type { ComponentContext, ComponentInteraction } from "./types.js";

/**
 * Called when a customId doesn't match any registered prefix. The default
 * replies with a plain ephemeral message; override to localize, brand, or
 * route it elsewhere.
 */
export type UnknownComponentHandler = (ctx: ComponentContext) => void | Promise<void>;

/**
 * Called when a component handler throws. `error` is always a
 * `ComponentError` — Circe normalizes and wraps whatever was thrown before
 * calling this. The default logs it and replies with a generic ephemeral
 * message; override for custom user-facing error presentation.
 */
export type ComponentErrorHandler = (ctx: ComponentContext, error: ComponentError) => void | Promise<void>;

export interface ComponentRouterOptions {
  registry: ComponentRegistry;
  logger: Logger;
  onUnknownComponent?: UnknownComponentHandler;
  onComponentError?: ComponentErrorHandler;
}

async function defaultOnUnknownComponent(ctx: ComponentContext): Promise<void> {
  ctx.logger.warn("Received interaction for an unregistered component", { customId: ctx.interaction.customId });
  await safeRespond(ctx.interaction, "This action is not currently available.");
}

async function defaultOnComponentError(ctx: ComponentContext, error: ComponentError): Promise<void> {
  ctx.logger.error(error.message, { error, correlationId: error.correlationId });
  await safeRespond(ctx.interaction, "Something went wrong while handling that action.");
}

/**
 * Handles a single button/select-menu interaction end to end: resolves the
 * handler by customId prefix, executes it, and funnels any failure through
 * one error boundary — `onUnknownComponent`/`onComponentError`, defaulting
 * to a plain ephemeral reply when the bot doesn't supply its own. Kept
 * separate from `attachComponentRouter` so it can be exercised with a
 * hand-built interaction stub in tests, without a live client.
 */
export async function handleComponentInteraction(
  interaction: ComponentInteraction,
  options: ComponentRouterOptions,
): Promise<void> {
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ customId: interaction.customId });

    const base = {
      interaction,
      client: interaction.client,
      guild: interaction.guild,
      member: interaction.member instanceof GuildMember ? interaction.member : null,
      user: interaction.user,
      logger,
      correlationId,
    };

    const handler = options.registry.resolve(interaction.customId);

    if (!handler) {
      await (options.onUnknownComponent ?? defaultOnUnknownComponent)({ ...base, params: undefined });
      return;
    }

    // `parse` runs inside the same try/catch as `execute` below — a bad
    // customId is an execution failure like any other, not a separate
    // error path. `ctx` starts with `params: undefined` so the error
    // handler always has a valid context even if `parse` itself throws.
    let ctx: ComponentContext = { ...base, params: undefined };

    try {
      ctx = { ...base, params: handler.parse?.(interaction.customId) };
      await handler.execute(ctx);
    } catch (error) {
      const normalized = normalizeError(error, `Component "${interaction.customId}" failed`);
      const componentError =
        normalized instanceof ComponentError
          ? normalized
          : new ComponentError(normalized.message, {
              cause: normalized,
              operational: normalized.operational,
              metadata: { ...normalized.metadata, reason: "execution-failed", customId: interaction.customId },
            });
      await (options.onComponentError ?? defaultOnComponentError)(ctx, componentError);
    }
  });
}

async function safeRespond(interaction: ComponentInteraction, content: string): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch {
    // The interaction may already have expired or been deleted — nothing more to do.
  }
}

/** Wires the router onto a live discord.js client's `interactionCreate` event. */
export function attachComponentRouter(client: Client, options: ComponentRouterOptions): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
      return;
    }
    void handleComponentInteraction(interaction, options);
  });
}
