import type { I18nResolver } from "./types.js";

export type Translator = (key: string, params?: Record<string, unknown>) => string;

/** Binds a resolver to one interaction's locale, producing the `ctx.t` function that context carries. */
export function createTranslator(resolver: I18nResolver, locale: string): Translator {
  return (key, params) => resolver.resolve(key, locale, params);
}
