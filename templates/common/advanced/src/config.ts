import { defineConfig } from '@sxnnyside/circe';
import { z } from 'zod';

export default defineConfig(
  z.object({
    DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required in .env'),
    PORT: z.coerce.number().default(8080),
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  }),
);
