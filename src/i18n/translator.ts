import type { I18nContext, I18nResolver } from './types.js';

export type Translator = (key: string, params?: Record<string, unknown>) => string;

/** The slice of any interaction the translation context is read from. */
export interface I18nInteractionSource {
  readonly guildId?: string | null;
  readonly guildLocale?: string | null;
  readonly user?: { readonly id: string };
}

export function i18nContextOf(interaction: I18nInteractionSource): I18nContext {
  return {
    guildId: interaction.guildId ?? null,
    guildLocale: interaction.guildLocale ?? null,
    userId: interaction.user?.id ?? '',
  };
}

/** Binds a resolver to one interaction's locale and context, producing the `ctx.t` function that context carries. */
export function createTranslator(
  resolver: I18nResolver,
  locale: string,
  context?: I18nContext,
): Translator {
  return (key, params) => resolver.resolve(key, locale, params, context);
}
