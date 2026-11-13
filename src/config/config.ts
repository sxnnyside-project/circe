/**
 * Legacy environment configuration subpath.
 *
 * @deprecated Use `src/config/env-config.js` instead.
 * @see {@link defineEnvConfig}
 * @see {@link defineConfig}
 * @packageDocumentation
 */
export type {
  CirceConfig,
  ConfigSource,
  EnvConfig,
  SafeParseSchema,
} from './env-config.js';

export {
  defineConfig,
  defineEnvConfig,
} from './env-config.js';
