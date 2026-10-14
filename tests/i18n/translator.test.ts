import { describe, expect, test } from 'bun:test';
import { createTranslator, i18nContextOf } from '../../src/i18n/translator.js';
import type { I18nResolver } from '../../src/i18n/types.js';

class RecordingResolver implements I18nResolver {
  calls: { key: string; locale: string; params?: Record<string, unknown> }[] = [];

  resolve(key: string, locale: string, params?: Record<string, unknown>): string {
    this.calls.push({ key, locale, ...(params !== undefined ? { params } : {}) });
    return `[${locale}] ${key}`;
  }
}

describe('createTranslator', () => {
  test('binds the resolver to a fixed locale across calls', () => {
    const resolver = new RecordingResolver();
    const t = createTranslator(resolver, 'fr-FR');

    expect(t('greeting.hello')).toBe('[fr-FR] greeting.hello');
    expect(t('greeting.bye')).toBe('[fr-FR] greeting.bye');
    expect(resolver.calls.map((call) => call.locale)).toEqual(['fr-FR', 'fr-FR']);
  });

  test('forwards params to the resolver untouched', () => {
    const resolver = new RecordingResolver();
    const t = createTranslator(resolver, 'en-US');

    t('greeting.hello', { name: 'Ana' });
    expect(resolver.calls[0]?.params).toEqual({ name: 'Ana' });
  });

  test('forwards no params when none are given', () => {
    const resolver = new RecordingResolver();
    const t = createTranslator(resolver, 'en-US');

    t('greeting.hello');
    expect(resolver.calls[0]?.params).toBeUndefined();
  });
});

describe('i18n context', () => {
  test('createTranslator forwards the context as the resolver’s fourth argument', () => {
    let received: unknown;
    const t = createTranslator(
      {
        resolve: (_key, _locale, _params, context) => {
          received = context;
          return 'x';
        },
      },
      'en-US',
      { guildId: 'g1', guildLocale: 'es-ES', userId: 'u1' },
    );

    t('k');

    expect(received).toEqual({ guildId: 'g1', guildLocale: 'es-ES', userId: 'u1' });
  });

  test('i18nContextOf maps a guild interaction and nulls the absent fields', () => {
    expect(i18nContextOf({ guildId: 'g1', guildLocale: 'pt-BR', user: { id: 'u1' } })).toEqual({
      guildId: 'g1',
      guildLocale: 'pt-BR',
      userId: 'u1',
    });
    expect(i18nContextOf({ user: { id: 'u2' } })).toEqual({
      guildId: null,
      guildLocale: null,
      userId: 'u2',
    });
  });
});
