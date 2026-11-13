import { describe, expect, test } from 'bun:test';
import {
  createTranslator,
  type DiscordLocale,
  defineI18nResolver,
  defineLocalizationResolver,
  IdentityI18nResolver,
  IdentityLocalizationResolver,
  interpolate,
  type LocalizationResolver,
  localizationContextOf,
  resolveInteractionLocale,
} from '../../src/localization/resolver.js';

describe('IdentityLocalizationResolver', () => {
  test('returns key verbatim and preserves backward compatibility with IdentityI18nResolver', () => {
    const resolver = new IdentityLocalizationResolver();
    const legacy = new IdentityI18nResolver();

    expect(resolver.resolve('cmd.help', 'es-ES', { count: 5 })).toBe('cmd.help');
    expect(legacy.resolve('cmd.help', 'en-US')).toBe('cmd.help');
    expect(legacy instanceof IdentityLocalizationResolver).toBe(true);
  });
});

describe('defineLocalizationResolver', () => {
  test('returns resolver verbatim and defineI18nResolver aliases it', () => {
    const mockResolver: LocalizationResolver = {
      resolve: (key, locale) => `[${locale}] ${key}`,
    };
    expect(defineLocalizationResolver(mockResolver)).toBe(mockResolver);
    expect(defineI18nResolver(mockResolver)).toBe(mockResolver);
  });
});

describe('localizationContextOf', () => {
  test('extracts context with fallback nulls', () => {
    expect(
      localizationContextOf({
        guildId: '123',
        guildLocale: 'es-419',
        user: { id: '456' },
      }),
    ).toEqual({
      guildId: '123',
      guildLocale: 'es-419',
      userId: '456',
    });

    expect(localizationContextOf({})).toEqual({
      guildId: null,
      guildLocale: null,
      userId: '',
    });
  });
});

describe('resolveInteractionLocale', () => {
  test('prioritizes user locale by default', () => {
    const locale = resolveInteractionLocale({
      locale: 'es-ES',
      guildLocale: 'en-US',
    });
    expect(locale).toBe('es-ES');
  });

  test('falls back to guildLocale when user locale is missing', () => {
    const locale = resolveInteractionLocale({
      guildLocale: 'pt-BR',
    });
    expect(locale).toBe('pt-BR');
  });

  test('prioritizes guild locale when configured with priority guild', () => {
    const locale = resolveInteractionLocale(
      {
        locale: 'es-ES',
        guildLocale: 'ja',
      },
      { priority: 'guild' },
    );
    expect(locale).toBe('ja');
  });

  test('uses defaultLocale when both user and guild locales are absent', () => {
    const locale = resolveInteractionLocale({}, { defaultLocale: 'de' });
    expect(locale).toBe('de');
  });

  test('defaults to en-US when everything is omitted', () => {
    const locale = resolveInteractionLocale({});
    expect(locale).toBe('en-US');
  });
});

describe('interpolate', () => {
  test('does not resolve tokens to inherited object members', () => {
    expect(interpolate('hi {constructor}', { name: 'x' })).toBe('hi {constructor}');
  });

  test('replaces tokens in template string', () => {
    const output = interpolate('Hello {user}, you have {count} messages!', {
      user: 'Alice',
      count: 42,
    });
    expect(output).toBe('Hello Alice, you have 42 messages!');
  });

  test('leaves unmatched tokens untouched', () => {
    const output = interpolate('Hello {user}, see {missing}', {
      user: 'Bob',
    });
    expect(output).toBe('Hello Bob, see {missing}');
  });

  test('returns original string when params is undefined or empty', () => {
    expect(interpolate('Hello world')).toBe('Hello world');
    expect(interpolate('Hello {user}', {})).toBe('Hello {user}');
  });
});

describe('createTranslator', () => {
  test('binds resolver and passes params and context', () => {
    let captured:
      | {
          key: string;
          locale: DiscordLocale;
          params?: Record<string, unknown> | undefined;
          context?: unknown;
        }
      | undefined;
    const resolver: LocalizationResolver = {
      resolve: (key, locale, params, context) => {
        captured = { key, locale, params, context };
        return interpolate('Translated {key}', { key });
      },
    };

    const ctx = { guildId: 'g1', guildLocale: 'es-ES', userId: 'u1' };
    const t = createTranslator(resolver, 'es-ES', ctx);

    const result = t('welcome', { name: 'Circe' });
    expect(result).toBe('Translated welcome');
    expect(captured).toEqual({
      key: 'welcome',
      locale: 'es-ES',
      params: { name: 'Circe' },
      context: ctx,
    });
  });
});
