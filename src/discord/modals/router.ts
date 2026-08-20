import { type Client, Events, GuildMember, type Interaction, type ModalSubmitInteraction } from "discord.js";
import { normalizeError } from "../../errors/normalize-error.js";
import { getCorrelationId, withCorrelationId } from "../../logging/context.js";
import type { Logger } from "../../logging/logger.js";
import { ModalError } from "./errors.js";
import type { ModalRegistry } from "./registry.js";
import type { ModalContext } from "./types.js";

/**
 * Called when a customId doesn't match any registered prefix. The default
 * replies with a plain ephemeral message; override to localize, brand, or
 * route it elsewhere.
 */
export type UnknownModalHandler = (ctx: ModalContext) => void | Promise<void>;

/**
 * Called when a modal handler throws. `error` is always a `ModalError` —
 * Circe normalizes and wraps whatever was thrown before calling this. The
 * default logs it and replies with a generic ephemeral message; override
 * for custom user-facing error presentation.
 */
export type ModalErrorHandler = (ctx: ModalContext, error: ModalError) => void | Promise<void>;

export interface ModalRouterOptions {
  registry: ModalRegistry;
  logger: Logger;
  onUnknownModal?: UnknownModalHandler;
  onModalError?: ModalErrorHandler;
}

async function defaultOnUnknownModal(ctx: ModalContext): Promise<void> {
  ctx.logger.warn("Received submission for an unregistered modal", { customId: ctx.interaction.customId });
  await safeRespond(ctx.interaction, "This form is not currently available.");
}

async function defaultOnModalError(ctx: ModalContext, error: ModalError): Promise<void> {
  ctx.logger.error(error.message, { error, correlationId: error.correlationId });
  await safeRespond(ctx.interaction, "Something went wrong while handling that submission.");
}

/**
 * Handles a single modal submission end to end: resolves the handler by
 * customId prefix, executes it, and funnels any failure through one error
 * boundary — `onUnknownModal`/`onModalError`, defaulting to a plain
 * ephemeral reply when the bot doesn't supply its own. Kept separate from
 * `attachModalRouter` so it can be exercised with a hand-built interaction
 * stub in tests, without a live client — the same shape as
 * `handleComponentInteraction`.
 */
export async function handleModalInteraction(
  interaction: ModalSubmitInteraction,
  options: ModalRouterOptions,
): Promise<void> {
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ customId: interaction.customId });

    const ctx: ModalContext = {
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
      await (options.onUnknownModal ?? defaultOnUnknownModal)(ctx);
      return;
    }

    try {
      await handler.execute(ctx);
    } catch (error) {
      const normalized = normalizeError(error, `Modal "${interaction.customId}" failed`);
      const modalError =
        normalized instanceof ModalError
          ? normalized
          : new ModalError(normalized.message, {
              cause: normalized,
              operational: normalized.operational,
              metadata: { ...normalized.metadata, reason: "execution-failed", customId: interaction.customId },
            });
      await (options.onModalError ?? defaultOnModalError)(ctx, modalError);
    }
  });
}

async function safeRespond(interaction: ModalSubmitInteraction, content: string): Promise<void> {
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
export function attachModalRouter(client: Client, options: ModalRouterOptions): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isModalSubmit()) {
      return;
    }
    void handleModalInteraction(interaction, options);
  });
}
