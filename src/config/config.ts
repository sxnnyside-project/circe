import type { z } from "zod";
import { ConfigError, issuesFromZodError } from "./errors.js";

export type ConfigSource = Record<string, string | undefined>;

export interface CirceConfig<Schema extends z.ZodType> {
  readonly schema: Schema;
  /**
   * Validates `source` (defaults to `process.env`) against the schema and
   * returns the typed, parsed result. Throws `ConfigError` — listing every
   * failing field at once — on failure.
   */
  load(source?: ConfigSource): z.infer<Schema>;
}

/**
 * Declares a typed configuration contract for a bot. Circe only provides
 * this loading/validation mechanism — each bot supplies and owns its own
 * schema; Circe has no opinion on what fields exist.
 */
export function defineConfig<Schema extends z.ZodType>(schema: Schema): CirceConfig<Schema> {
  return {
    schema,
    load(source: ConfigSource = process.env): z.infer<Schema> {
      const result = schema.safeParse(source);

      if (!result.success) {
        const issues = issuesFromZodError(result.error);
        throw new ConfigError(`Invalid configuration: ${issues.length} issue(s) found`, {
          cause: result.error,
          issues,
        });
      }

      return result.data;
    },
  };
}
