import type { I18nResolver } from './types.js';

/**
 * The zero-config default `ctx.t` falls back to when a bot hasn't
 * configured an `I18nResolver`: returns `key` verbatim, ignoring `params`
 * and `locale` entirely. Never throws, never silently mistranslates —
 * a bot that hasn't wired up i18n sees its raw keys in Discord, which is
 * an honest, obvious signal to configure `i18n.ts` rather than a crash or
 * a plausible-looking wrong string.
 */
export class IdentityI18nResolver implements I18nResolver {
  resolve(key: string, _locale?: string, _params?: Record<string, unknown>): string {
    return key;
  }
}
