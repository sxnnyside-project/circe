import type { Locale, LocaleString, LocalizationMap } from 'discord.js';

/**
 * Union of official Discord locales and custom BCP-47 language tags.
 * Provides full IDE autocomplete for Discord's 32 official locales while allowing custom dialect tags.
 *
 * @public
 */
export type DiscordLocale = Locale | LocaleString | (string & {});

export type { LocaleString, LocalizationMap };

/**
 * Metadata passed to a localization resolver describing the interaction environment.
 * Enables guild-specific or user-specific fallback chains.
 *
 * @public
 */
export interface LocalizationContext {
  /** `null` outside a guild (direct messages). */
  readonly guildId: string | null;
  /** The guild's preferred locale; `null` outside a guild or for a non-community guild. */
  readonly guildLocale: string | null;
  /** The invoker's Discord user ID. */
  readonly userId: string;
}

/**
 * Contextual interaction metadata for internationalization.
 *
 * @deprecated Use `LocalizationContext` instead.
 * @see {@link LocalizationContext}
 */
export type I18nContext = LocalizationContext;

/**
 * Bound translation function available on every interaction context (`ctx.t`).
 *
 * @param key - Translation key identifier.
 * @param params - Optional token replacement map.
 * @returns Localized string.
 * @public
 */
export type Translator = (key: string, params?: Record<string, unknown>) => string;

/**
 * Resolves localized strings for a given locale and key.
 *
 * @remarks
 * Circe is agnostic to translation engines: implement this interface to connect
 * i18next, Project Fluent, Rosetta, or a plain in-memory map.
 *
 * @example
 * ```ts
 * export const resolver: LocalizationResolver = {
 *   resolve(key, locale, params) {
 *     return messages[locale]?.[key] ?? key;
 *   },
 * };
 * ```
 *
 * @public
 */
export interface LocalizationResolver {
  /**
   * Resolves a localized string.
   *
   * @param key - Translation key identifier.
   * @param locale - Target Discord or BCP-47 locale.
   * @param params - Optional token values for interpolation.
   * @param context - Interaction metadata (guildId, guildLocale, userId).
   * @returns Localized string.
   */
  resolve(
    key: string,
    locale: DiscordLocale,
    params?: Record<string, unknown>,
    context?: LocalizationContext,
  ): string;
}

/**
 * Resolves localized strings for a given locale and key.
 *
 * @deprecated Use `LocalizationResolver` instead.
 * @see {@link LocalizationResolver}
 */
export type I18nResolver = LocalizationResolver;

/**
 * The zero-config default `ctx.t` falls back to when a bot hasn't configured a resolver:
 * returns `key` verbatim, ignoring `locale` and `params`.
 *
 * @public
 */
export class IdentityLocalizationResolver implements LocalizationResolver {
  /**
   * Returns `key` verbatim.
   *
   * @param key - Translation key identifier.
   * @param _locale - Target locale (unused).
   * @param _params - Interpolation parameters (unused).
   * @returns The key itself.
   */
  resolve(key: string, _locale?: DiscordLocale, _params?: Record<string, unknown>): string {
    return key;
  }
}

/**
 * Zero-config default resolver.
 *
 * @deprecated Use `IdentityLocalizationResolver` instead.
 * @see {@link IdentityLocalizationResolver}
 */
export class IdentityI18nResolver extends IdentityLocalizationResolver {}

/**
 * Identity helper for declaring a bot's `localization.ts` (or `i18n.ts`) module.
 *
 * @example
 * ```ts
 * export default defineLocalizationResolver({
 *   resolve(key, locale) {
 *     return translations[locale]?.[key] ?? key;
 *   },
 * });
 * ```
 *
 * @param resolver - The custom localization resolver implementation.
 * @returns The typed localization resolver.
 * @public
 */
export function defineLocalizationResolver(resolver: LocalizationResolver): LocalizationResolver {
  return resolver;
}

/**
 * Identity helper for a bot's `i18n.ts` module.
 *
 * @deprecated Use `defineLocalizationResolver` instead.
 * @see {@link defineLocalizationResolver}
 */
export const defineI18nResolver = defineLocalizationResolver;

/**
 * The slice of an interaction from which localization context is derived.
 *
 * @public
 */
export interface LocalizationInteractionSource {
  readonly guildId?: string | null;
  readonly guildLocale?: string | null;
  readonly user?: { readonly id: string };
}

/**
 * Extracts a `LocalizationContext` from a Discord interaction.
 *
 * @param interaction - Interaction source containing guildId, guildLocale, and user.
 * @returns Clean `LocalizationContext` object.
 * @public
 */
export function localizationContextOf(
  interaction: LocalizationInteractionSource,
): LocalizationContext {
  return {
    guildId: interaction.guildId ?? null,
    guildLocale: interaction.guildLocale ?? null,
    userId: interaction.user?.id ?? '',
  };
}

/**
 * Extracts an `I18nContext` from a Discord interaction.
 *
 * @deprecated Use `localizationContextOf` instead.
 * @see {@link localizationContextOf}
 */
export const i18nContextOf = localizationContextOf;

/**
 * Binds a `LocalizationResolver` to a specific interaction's locale and context,
 * creating the `ctx.t` translation function.
 *
 * @param resolver - Active localization resolver instance.
 * @param locale - Target interaction locale.
 * @param context - Optional interaction context metadata.
 * @returns Ready-to-use bound `Translator` function.
 * @public
 */
export function createTranslator(
  resolver: LocalizationResolver,
  locale: DiscordLocale,
  context?: LocalizationContext,
): Translator {
  return (key, params) => resolver.resolve(key, locale, params, context);
}

/**
 * Options for resolving the preferred interaction locale.
 *
 * @experimental
 */
export interface ResolveInteractionLocaleOptions {
  /**
   * Which locale to prioritize when both are present:
   * - `'user'`: prioritize user's Discord client language (ideal for ephemeral replies or DMs).
   * - `'guild'`: prioritize server's community language (ideal for public server announcements).
   *
   * @defaultValue `'user'`
   */
  readonly priority?: 'user' | 'guild';

  /**
   * Fallback locale when neither user nor guild locale is available.
   *
   * @defaultValue `'en-US'`
   */
  readonly defaultLocale?: DiscordLocale;
}

/**
 * Resolves the effective locale for an interaction considering user preference,
 * guild preference, and a fallback default.
 *
 * @example
 * ```ts
 * const locale = resolveInteractionLocale(interaction, { priority: 'guild' });
 * ```
 *
 * @param interaction - Discord interaction carrying `locale` and optional `guildLocale`.
 * @param options - Priority order and fallback locale options.
 * @returns The resolved effective DiscordLocale string.
 * @experimental
 */
export function resolveInteractionLocale(
  interaction: { readonly locale?: string; readonly guildLocale?: string | null },
  options: ResolveInteractionLocaleOptions = {},
): DiscordLocale {
  const priority = options.priority ?? 'user';
  const defaultLocale = options.defaultLocale ?? 'en-US';

  if (priority === 'guild') {
    return interaction.guildLocale ?? interaction.locale ?? defaultLocale;
  }
  return interaction.locale ?? interaction.guildLocale ?? defaultLocale;
}

/**
 * Lightweight string template interpolator. Replaces `{key}` tokens with `params[key]`.
 * Useful for building lightweight zero-dependency resolvers without pulling in heavy engines.
 *
 * @example
 * ```ts
 * interpolate('Hello, {name}!', { name: 'Alice' }); // 'Hello, Alice!'
 * ```
 *
 * @param template - Template string with `{token}` placeholders.
 * @param params - Dictionary of replacement values.
 * @returns Formatted string with interpolated tokens.
 * @experimental
 */
export function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) {
    return template;
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
    // Own keys only: `{constructor}` must not resolve to an inherited Object member.
    const value = Object.hasOwn(params, key) ? params[key] : undefined;
    return value !== undefined ? String(value) : match;
  });
}
