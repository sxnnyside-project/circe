/**
 * What Discord says about who is asking and where, handed to the resolver
 * alongside the interaction's own locale so a bot can implement its own
 * fallback chain (user locale, then guild preference, then a default)
 * without smuggling ids through `params`.
 */
export interface I18nContext {
  /** `null` outside a guild. */
  readonly guildId: string | null;
  /** The guild's preferred locale; `null` outside a guild or for a non-community guild. */
  readonly guildLocale: string | null;
  readonly userId: string;
}

/**
 * Translates `key` for `locale`, interpolating `params` however the
 * resolver sees fit. Circe never ships a translation engine — a bot
 * connects i18next, fluent, a plain JSON map, or anything else behind
 * this one method. `context` is omitted by callers that have no
 * interaction to describe.
 */
export interface I18nResolver {
  resolve(
    key: string,
    locale: string,
    params?: Record<string, unknown>,
    context?: I18nContext,
  ): string;
}

/** Identity helper for a bot's `i18n.ts` — same purpose as `defineCommand`. */
export function defineI18nResolver(resolver: I18nResolver): I18nResolver {
  return resolver;
}
