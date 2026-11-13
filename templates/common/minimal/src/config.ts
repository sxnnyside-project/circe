import { defineConfig } from '@sxnnyside/circe';
import { z } from 'zod';

export default defineConfig(
  z.object({
    DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required in .env'),
  }),
);
