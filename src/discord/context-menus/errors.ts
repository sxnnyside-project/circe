import { CirceError } from '../../errors/circe-error.js';

/**
 * Raised for context menu command registry, discovery, validation, and routing failures.
 *
 * @remarks
 * Used by {@link ContextMenuCommandRegistry}, {@link loadContextMenuCommands}, and
 * {@link handleContextMenuCommandInteraction} when interacting with user or message context menu commands.
 *
 * @public
 */
export class ContextMenuCommandError extends CirceError {}
