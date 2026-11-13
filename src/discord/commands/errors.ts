import { CirceError } from '../../errors/circe-error.js';

/**
 * Raised for slash command discovery, registry collision, execution, or Discord REST registration failures.
 *
 * @public
 */
export class CommandError extends CirceError {}
