import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineConfig } from '../../src/config/config.js';
import { ConfigError } from '../../src/config/errors.js';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
});

describe('defineConfig', () => {
  test('returns a typed, parsed result for valid input', () => {
    const config = defineConfig(schema);
    const result = config.load({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client-id',
    });

    expect(result.DISCORD_TOKEN).toBe('token');
    expect(result.DISCORD_CLIENT_ID).toBe('client-id');
  });

  test('applies schema defaults when values are absent', () => {
    const config = defineConfig(schema);
    const result = config.load({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client-id',
    });

    expect(result.PORT).toBe(3000);
    expect(result.ENVIRONMENT).toBe('development');
  });

  test('throws ConfigError listing every missing required field', () => {
    const config = defineConfig(schema);

    expect(() => config.load({})).toThrow(ConfigError);

    try {
      config.load({});
      throw new Error('expected load() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;
      const paths = configError.issues.map((issue) => issue.path);
      expect(paths).toContain('DISCORD_TOKEN');
      expect(paths).toContain('DISCORD_CLIENT_ID');
    }
  });

  test('rejects malformed values with a useful message', () => {
    const config = defineConfig(schema);

    try {
      config.load({ DISCORD_TOKEN: 'token', DISCORD_CLIENT_ID: 'id', PORT: 'not-a-number' });
      throw new Error('expected load() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;
      expect(configError.issues.some((issue) => issue.path === 'PORT')).toBe(true);
    }
  });

  test('defaults the config source to process.env', () => {
    const config = defineConfig(z.object({ HOME: z.string().optional() }));
    expect(() => config.load()).not.toThrow();
  });

  test('ConfigError is operational', () => {
    const config = defineConfig(schema);
    try {
      config.load({});
    } catch (error) {
      expect((error as ConfigError).operational).toBe(true);
    }
  });

  test('ConfigError serializes its issues exactly once, not duplicated', () => {
    const config = defineConfig(schema);
    try {
      config.load({});
      throw new Error('expected load() to throw');
    } catch (error) {
      const configError = error as ConfigError;
      const serialized = JSON.parse(JSON.stringify(configError));
      expect(Array.isArray(serialized.issues)).toBe(true);
      expect(serialized.issues.length).toBe(configError.issues.length);
      // metadata (the generic bag) no longer also carries a copy of `issues`.
      expect(serialized.metadata.issues).toBeUndefined();
    }
  });
});
