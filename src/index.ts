// Application & Lifecycle
export type {
  CirceApp,
  CirceCommandGroups,
  CirceCommands,
  CirceComponents,
  CirceContextMenuCommands,
  CirceCredentials,
  CirceEvents,
  CirceModals,
  CreateCirceOptions,
  IntervalOptions,
  IntervalTask,
} from './application/app.js';
export { createCirce } from './application/app.js';
export type { ErrorBoundaryModule } from './application/error-boundary.js';
export { defineErrorBoundary } from './application/error-boundary.js';
export type { LifecycleHook, LifecycleState, ReadyHook } from './application/lifecycle.js';
export { LifecycleError } from './application/lifecycle.js';
export type {
  MiddlewareContext,
  MiddlewareKind,
  MiddlewareModule,
} from './application/middleware.js';
export { defineMiddleware } from './application/middleware.js';

// Configuration & Integrations
export type {
  CirceConfigFile,
  HttpTransportConfig,
  TransportMode,
} from './config/circe-config.js';
export { defineCirceConfig } from './config/circe-config.js';
export type {
  CirceConfig,
  ConfigSource,
  EnvConfig,
  SafeParseSchema,
} from './config/env-config.js';
export {
  defineConfig,
  defineEnvConfig,
} from './config/env-config.js';
export type { ConfigErrorOptions, ConfigIssue } from './config/errors.js';
export { ConfigError, issuesFromZodError } from './config/errors.js';
export type {
  CirceIntegration,
  CirceIntegrationContext,
  IntervalRegistration,
  ResolvedIntegrations,
  ScanCategory,
} from './config/integration.js';
export {
  defineIntegration,
  IntegrationError,
  resolveIntegrations,
} from './config/integration.js';

// Discord Commands & Autocomplete
export { CommandError } from './discord/commands/errors.js';
export type {
  CommandGroupDefinition,
  SubcommandDefinition,
} from './discord/commands/groups/types.js';
export { defineCommandGroup, defineSubcommand } from './discord/commands/groups/types.js';
export type { CommandRest } from './discord/commands/registration.js';
export { CommandRegistry } from './discord/commands/registry.js';
export type {
  CommandErrorHandler,
  GuardDeniedHandler,
  UnknownCommandHandler,
} from './discord/commands/router.js';
export type {
  AutocompleteContext,
  AutocompleteHandler,
  CommandBuilder,
  CommandContext,
  CommandDefinition,
  Guard,
  GuardResult,
} from './discord/commands/types.js';
export { defineCommand } from './discord/commands/types.js';

// Discord Components & Pagination
export { ComponentError } from './discord/components/errors.js';
export { MemoryPaginationStore } from './discord/components/pagination/memory-store.js';
export type {
  CreatePaginatorOptions,
  Paginator,
} from './discord/components/pagination/paginator.js';
export { createPaginator } from './discord/components/pagination/paginator.js';
export type {
  PaginationSession,
  PaginationStore,
  PaginatorPage,
  SerializedPaginatorPage,
} from './discord/components/pagination/types.js';
export type { ParamNames, ParamsFromPattern } from './discord/components/pattern.js';
export { ComponentRegistry } from './discord/components/registry.js';
export type {
  ComponentErrorHandler,
  ComponentGuardDeniedHandler,
  UnknownComponentHandler,
} from './discord/components/router.js';
export type {
  ComponentContext,
  ComponentDefinition,
  ComponentGuard,
  ComponentInteraction,
  PatternComponentDefinition,
} from './discord/components/types.js';
export { defineComponent } from './discord/components/types.js';

// Discord Context Menus
export { ContextMenuCommandError } from './discord/context-menus/errors.js';
export { ContextMenuCommandRegistry } from './discord/context-menus/registry.js';
export type {
  ContextMenuCommandErrorHandler,
  ContextMenuGuardDeniedHandler,
  UnknownContextMenuCommandHandler,
} from './discord/context-menus/router.js';
export type {
  ContextMenuRegistrationOptions,
  MessageCommandDefinition,
  MessageCommandGuard,
  MessageContextMenuCommandContext,
  UserCommandDefinition,
  UserCommandGuard,
  UserContextMenuCommandContext,
} from './discord/context-menus/types.js';
export { defineMessageCommand, defineUserCommand } from './discord/context-menus/types.js';

// Discord Events
export { EventError } from './discord/events/errors.js';
export { EventRegistry } from './discord/events/registry.js';
export type { EventDefinition } from './discord/events/types.js';
export { defineEvent } from './discord/events/types.js';

// Discord Guards & Cooldowns
export type {
  CooldownContext,
  CooldownOptions,
  CooldownScope,
} from './discord/guards/cooldown/cooldown.js';
export { cooldown } from './discord/guards/cooldown/cooldown.js';
export { MemoryCooldownStore } from './discord/guards/cooldown/memory-store.js';
export type { CooldownStore } from './discord/guards/cooldown/types.js';
export type { GuildContext } from './discord/guards/guild-only.js';
export { guildOnly } from './discord/guards/guild-only.js';
export type { InvokerContext, InvokerOnlyOptions } from './discord/guards/invoker-only.js';
export { invokerOnly } from './discord/guards/invoker-only.js';
export type { MemberContext } from './discord/guards/permissions.js';
export { hasPermission } from './discord/guards/permissions.js';

// Discord Modals
export { ModalError } from './discord/modals/errors.js';
export { ModalRegistry } from './discord/modals/registry.js';
export type {
  ModalErrorHandler,
  ModalGuardDeniedHandler,
  UnknownModalHandler,
} from './discord/modals/router.js';
export type { ModalContext, ModalDefinition, ModalGuard } from './discord/modals/types.js';
export { defineModal } from './discord/modals/types.js';

// Core Error Architecture
export type { CirceErrorOptions } from './errors/circe-error.js';
export { CirceError } from './errors/circe-error.js';
export type { DiscoveryConflictErrorOptions } from './errors/discovery-conflict-error.js';
export { DiscoveryConflictError } from './errors/discovery-conflict-error.js';
export type {
  ModuleValidationErrorOptions,
  ModuleValidationIssue,
} from './errors/module-validation-error.js';
export { ModuleValidationError } from './errors/module-validation-error.js';
export { normalizeError } from './errors/normalize-error.js';

// Health & Readiness Probes
export type {
  HealthCheck,
  HealthConfig,
  HealthHandlerOptions,
  HealthProbeResponse,
  HealthProbeStatus,
} from './health/handler.js';
export { createHealthHandler } from './health/handler.js';

// Localization (l10n, i18n & g11n)
export type {
  DiscordLocale,
  I18nContext,
  I18nResolver,
  LocalizationContext,
  LocalizationInteractionSource,
  LocalizationResolver,
  ResolveInteractionLocaleOptions,
  Translator,
} from './localization/resolver.js';
export {
  createTranslator,
  defineI18nResolver,
  defineLocalizationResolver,
  IdentityI18nResolver,
  IdentityLocalizationResolver,
  i18nContextOf,
  interpolate,
  localizationContextOf,
  resolveInteractionLocale,
} from './localization/resolver.js';

// Logging & Correlation
export {
  generateCorrelationId,
  getCorrelationId,
  getParentCorrelationId,
  withCorrelationId,
} from './logging/context.js';
export type {
  LogEntry,
  LogEnvironment,
  Logger,
  LoggerOptions,
  LogLevel,
  LogMetadata,
  LogSink,
} from './logging/logger.js';
export { createLogger } from './logging/logger.js';

// Observability & Golden Signals Telemetry
export type {
  InteractionMetric,
  InteractionMetricKind,
  InteractionMetricStatus,
  InteractionTelemetryHandler,
  LatencyAccumulator,
  LatencySnapshot,
} from './observability/metrics.js';
export { createLatencyAccumulator } from './observability/metrics.js';
export type {
  ErrorReportContext,
  ErrorReporter,
  ErrorReportKind,
} from './observability/report-error.js';

// Runtime & Platform Introspection
export type { Runtime } from './runtime/detect.js';
export { detectRuntime } from './runtime/detect.js';
export type { Watcher, WatchTarget } from './runtime/watcher.js';
export { createWatcher } from './runtime/watcher.js';

// Transport & HTTP Interactions
export type { InteractionsHttpHandlerOptions } from './transport/http-handler.js';
export { createInteractionsHandler } from './transport/http-handler.js';
export type {
  InteractionsServer,
  InteractionsServerOptions,
} from './transport/serve.js';
export { startInteractionsServer } from './transport/serve.js';
export type { VerifySignatureOptions } from './transport/verify-signature.js';
export {
  DISCORD_SIGNATURE_HEADER,
  DISCORD_TIMESTAMP_HEADER,
  verifyDiscordSignature,
} from './transport/verify-signature.js';
