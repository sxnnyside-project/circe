import type { z } from 'zod';
import { ConfigError, issuesFromZodError } from './errors.js';

/**
 * Key-value mapping of raw environment strings.
 * @public
 */
export type ConfigSource = Record<string, string | undefined>;

/**
 * Generic schema validator contract supporting Zod, Valibot, ArkType, or any validator with `safeParse`.
 *
 * @public
 */
export interface SafeParseSchema<T = unknown> {
  /**
   * Synchronously or asynchronously parses input data according to schema rules.
   *
   * @param data - Raw input to validate.
   * @returns Successful result containing typed `data` or failure result with `error`.
   */
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown };
}

/**
 * Typed environment configuration contract loaded from environment variables.
 *
 * @public
 */
export interface EnvConfig<T = unknown> {
  readonly schema: unknown;

  /**
   * Validates `source` (defaults to `process.env`) against the schema and
   * returns the typed, parsed result.
   *
   * @param source - Optional environment dictionary. Defaults to `process.env`.
   * @returns Typed and validated configuration object.
   * @throws {@link ConfigError} When one or more fields fail validation, listing every issue at once.
   */
  load(source?: ConfigSource): T;
}

/**
 * Typed configuration contract for a bot.
 *
 * @see {@link EnvConfig}
 * @public
 */
export type CirceConfig<Schema extends z.ZodType = z.ZodType> = EnvConfig<z.infer<Schema>>;

/**
 * Declares a typed environment configuration contract for a bot.
 * Supports Zod schemas, Valibot, ArkType, or any validator implementing `safeParse`.
 *
 * @remarks
 * Decoupled from any single schema library. Any validator with a `.safeParse()` method
 * conforming to `SafeParseSchema` can be used.
 *
 * @example
 * ```ts
 * import { defineEnvConfig } from '@sxnnyside/circe';
 * import { z } from 'zod';
 *
 * export const config = defineEnvConfig(
 *   z.object({
 *     DISCORD_TOKEN: z.string().min(1),
 *     DATABASE_URL: z.string().url().optional(),
 *   }),
 * );
 *
 * const env = config.load();
 * ```
 *
 * @param schema - Schema validator implementing `safeParse`.
 * @returns Config loader instance ready to parse environment sources.
 * @throws {@link ConfigError} If validation fails during `load()`.
 * @public
 */
export function defineEnvConfig<Schema extends SafeParseSchema>(
  schema: Schema,
): EnvConfig<Schema extends SafeParseSchema<infer D> ? D : unknown> {
  type Output = Schema extends SafeParseSchema<infer D> ? D : unknown;
  return {
    schema,
    load(source?: ConfigSource): Output {
      const defaultSource = typeof process !== 'undefined' ? process.env : {};
      const envSource = source ?? defaultSource;
      const result = schema.safeParse(envSource);

      if (!result.success) {
        const issues = issuesFromZodError(result.error as never);
        throw new ConfigError(`Invalid configuration: ${issues.length} issue(s) found`, {
          cause: result.error,
          issues,
        });
      }

      return result.data as Output;
    },
  };
}

/**
 * Declares a typed configuration contract for a bot. Circe provides
 * this loading/validation mechanism — each bot supplies and owns its own
 * schema.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@sxnnyside/circe';
 * import { z } from 'zod';
 *
 * export const config = defineConfig(
 *   z.object({
 *     DISCORD_TOKEN: z.string(),
 *   }),
 * );
 * ```
 *
 * @see {@link defineEnvConfig}
 * @param schema - Zod schema defining expected environment variables.
 * @returns Typed `CirceConfig` instance.
 * @public
 */
export function defineConfig<Schema extends z.ZodType>(schema: Schema): CirceConfig<Schema> {
  return defineEnvConfig(schema) as CirceConfig<Schema>;
}
