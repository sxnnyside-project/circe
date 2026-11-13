import { defineCommandGroup, hasPermission } from '@sxnnyside/circe';
import { PermissionFlagsBits } from 'discord.js';

export default defineCommandGroup({
  name: 'admin',
  description: 'Administrative server management commands.',
  guards: [hasPermission(PermissionFlagsBits.Administrator)],
});
