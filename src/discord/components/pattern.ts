/** Extracts `"userId" | "action"` from `"ticket:close:[userId]:[action]"`. */
export type ParamNames<Pattern extends string> =
  Pattern extends `${string}[${infer Name}]${infer Rest}` ? Name | ParamNames<Rest> : never;

/** The typed `ctx.params` shape a `pattern` string produces. */
export type ParamsFromPattern<Pattern extends string> = { [K in ParamNames<Pattern>]: string };

export interface CompiledPattern {
  readonly prefix: string;
  parse(customId: string): Record<string, string>;
}

const PLACEHOLDER = /^\[[^[\]:]+\]$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles a `pattern` string like `"ticket:close:[userId]:[action]"` into
 * the `prefix`/`parse` pair the component registry and router already
 * understand. Pattern support is sugar resolved entirely at definition
 * time — the registry, router, and loader never see a pattern, only the
 * ordinary `ComponentDefinition` shape it compiles down to.
 *
 * Every dynamic segment (`[name]`) must come after at least one static
 * segment — that static prefix is what the registry's longest-prefix-match
 * resolves on. `[name]` segments match one colon-delimited segment each,
 * never `:` itself.
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
