import { type ChatInputCommandInteraction, type Client, Events, GuildMember, type Interaction } from "discord.js";
import type { MiddlewareModule } from "../../application/middleware.js";
import { runWithMiddleware } from "../../application/middleware.js";
import { normalizeError } from "../../errors/normalize-error.js";
import { IdentityI18nResolver } from "../../i18n/identity-resolver.js";
import { createTranslator } from "../../i18n/translator.js";
import type { I18nResolver } from "../../i18n/types.js";
import { getCorrelationId, withCorrelationId } from "../../logging/context.js";
import type { Logger } from "../../logging/logger.js";
import { reportError } from "../../observability/report-error.js";
import type { ErrorReporter } from "../../observability/types.js";
import { CommandError } from "./errors.js";
import type { CommandRegistry } from "./registry.js";
import type { CommandContext } from "./types.js";

/**
 * Called when an interaction names a command that isn't in the registry.
 * The default replies with a plain ephemeral message; override to localize
 * it, brand it, or route it elsewhere.
 */
export type UnknownCommandHandler = (ctx: CommandContext) => void | Promise<void>;

/**
 * Called when a guard denies execution. `reason` is whatever the guard
 * returned. The default replies with that reason as plain ephemeral text;
 * override to control the reply's content and shape (embeds, localization,
 * a different interaction method entirely) instead of being limited to
 * Circe's plain-text default.
 */
export type GuardDeniedHandler = (ctx: CommandContext, reason: string) => void | Promise<void>;

/**
 * Called when a guard or `execute()` throws. `error` is always a
 * `CommandError` — Circe normalizes and wraps whatever was thrown before
 * calling this. The default logs it and replies with a generic ephemeral
 * message; override for custom user-facing error presentation.
 */
export type CommandErrorHandler = (ctx: CommandContext, error: CommandError) => void | Promise<void>;

export interface CommandRouterOptions {
  registry: CommandRegistry;
  logger: Logger;
  onUnknownCommand?: UnknownCommandHandler;
  onGuardDenied?: GuardDeniedHandler;
  onCommandError?: CommandErrorHandler;
  middleware?: MiddlewareModule;
  /** Defaults to a resolver that returns every key verbatim, untranslated. */
  i18n?: I18nResolver;
  /** Called for every error this router's boundary catches, decoupled from the user-facing reply — for external reporting (OpenTelemetry, Sentry, metrics). */
  onError?: ErrorReporter;
}

const defaultI18nResolver = new IdentityI18nResolver();

async function defaultOnUnknownCommand(ctx: CommandContext): Promise<void> {
  ctx.logger.warn("Received interaction for an unregistered command", { command: ctx.interaction.commandName });
  await safeRespond(ctx.interaction, "This command is not currently available.");
}

async function defaultOnGuardDenied(ctx: CommandContext, reason: string): Promise<void> {
  ctx.logger.info("Command blocked by guard", { reason });
  await safeRespond(ctx.interaction, reason);
}

async function defaultOnCommandError(ctx: CommandContext, error: CommandError): Promise<void> {
  ctx.logger.error(error.message, { error, correlationId: error.correlationId });
  await safeRespond(ctx.interaction, "Something went wrong while running that command.");
}

/**
 * Handles a single chat-input command interaction end to end: resolves the
 * command, runs its guards, executes it, and funnels any failure through
 * one error boundary — `onUnknownCommand`/`onGuardDenied`/`onCommandError`,
 * defaulting to a plain ephemeral reply when the bot doesn't supply its
 * own. Kept separate from `attachCommandRouter` so it can be exercised
 * with a hand-built interaction stub in tests, without a live client or
 * gateway connection.
 */
export async function handleCommandInteraction(
  interaction: ChatInputCommandInteraction,
  options: CommandRouterOptions,
): Promise<void> {
  await withCorrelationId(async () => {
    const correlationId = getCorrelationId();
    const logger = options.logger.child({ command: interaction.commandName });

    const ctx: CommandContext = {
      interaction,
      client: interaction.client,
      guild: interaction.guild,
      member: interaction.member instanceof GuildMember ? interaction.member : null,
      user: interaction.user,
      logger,
      correlationId,
      t: createTranslator(options.i18n ?? defaultI18nResolver, interaction.locale),
    };

    const command = options.registry.get(interaction.commandName);

    if (!command) {
      await (options.onUnknownCommand ?? defaultOnUnknownCommand)(ctx);
      return;
    }

    try {
      await runWithMiddleware(
        options.middleware,
        () => ({ kind: "command", name: interaction.commandName, logger, correlationId }),
        async () => {
          for (const guard of command.guards ?? []) {
            const result = await guard(ctx);
            if (result !== true) {
              await (options.onGuardDenied ?? defaultOnGuardDenied)(ctx, result);
              return;
            }
          }

          await command.execute(ctx);
        },
      );
    } catch (error) {
      const normalized = normalizeError(error, `Command "${interaction.commandName}" failed`);
      const commandError =
        normalized instanceof CommandError
          ? normalized
          : new CommandError(normalized.message, {
              cause: normalized,
              operational: normalized.operational,
              metadata: { ...normalized.metadata, reason: "execution-failed", command: interaction.commandName },
            });
      await reportError(
        options.onError,
        commandError,
        { kind: "command", name: interaction.commandName, correlationId },
        logger,
      );
      await (options.onCommandError ?? defaultOnCommandError)(ctx, commandError);
    }
  });
}

async function safeRespond(interaction: ChatInputCommandInteraction, content: string): Promise<void> {
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
export function attachCommandRouter(client: Client, options: CommandRouterOptions): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }
    void handleCommandInteraction(interaction, options);
  });
}
