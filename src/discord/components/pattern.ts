/**
 * Extracts union of parameter token names from a route pattern string.
 *
 * @example
 * ```typescript
 * type Keys = ParamNames<"ticket:view:[id]:[tab]">; // "id" | "tab"
 * ```
 *
 * @public
 */
export type ParamNames<Pattern extends string> =
  Pattern extends `${string}[${infer Name}]${infer Rest}` ? Name | ParamNames<Rest> : never;

/**
 * Derives a strongly-typed parameter dictionary from a route pattern string.
 *
 * @typeParam Pattern - The literal route string with colon-delimited variables.
 *
 * @public
 */
export type ParamsFromPattern<Pattern extends string> = { [K in ParamNames<Pattern>]: string };

/**
 * Compiled representation of a route pattern.
 *
 * @internal
 */
export interface CompiledPattern {
  /** The leading static segment prefix used for registry prefix matching. */
  readonly prefix: string;
  /** Custom parser extracting named token key-value pairs from `customId`. */
  parse(customId: string): Record<string, string>;
}

const PLACEHOLDER = /^\[[^[\]:]+\]$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles a colon-delimited route pattern into a static prefix and regular expression parser.
 *
 * @remarks
 * Every dynamic segment (`[name]`) must be preceded by at least one static prefix segment.
 *
 * @param pattern - The route pattern (e.g. `"ticket:view:[id]"`).
 * @returns The compiled prefix and parse delegate.
 *
 * @internal
 */
export function compilePattern(pattern: string): CompiledPattern {
  const segments = pattern.split(':');
  const staticSegments: string[] = [];
  let splitIndex = 0;

  for (; splitIndex < segments.length; splitIndex++) {
    if (PLACEHOLDER.test(segments[splitIndex] as string)) {
      break;
    }
    staticSegments.push(segments[splitIndex] as string);
  }

  if (staticSegments.length === 0) {
    throw new Error(
      `Pattern "${pattern}" must start with at least one static segment before a "[param]"`,
    );
  }

  const prefix = `${staticSegments.join(':')}:`;
  const paramNames: string[] = [];
  const regexSource = segments
    .map((segment) => {
      if (PLACEHOLDER.test(segment)) {
        paramNames.push(segment.slice(1, -1));
        return '([^:]+)';
      }
      return escapeRegExp(segment);
    })
    .join(':');
  const regex = new RegExp(`^${regexSource}$`);

  return {
    prefix,
    parse(customId: string): Record<string, string> {
      const match = regex.exec(customId);
      if (!match) {
        throw new Error(`customId "${customId}" does not match pattern "${pattern}"`);
      }
      const params: Record<string, string> = {};
      for (const [index, name] of paramNames.entries()) {
        params[name] = match[index + 1] as string;
      }
      return params;
    },
  };
}
