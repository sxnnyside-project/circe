/**
 * Translates `key` for `locale`, interpolating `params` however the
 * resolver sees fit. Circe never ships a translation engine — a bot
 * connects i18next, fluent, a plain JSON map, or anything else behind
 * this one method.
 */
export interface I18nResolver {
  resolve(key: string, locale: string, params?: Record<string, unknown>): string;
}

/** Identity helper for a bot's `i18n.ts` — same purpose as `defineCommand`. */
export function defineI18nResolver(resolver: I18nResolver): I18nResolver {
  return resolver;
}
