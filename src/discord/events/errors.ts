import { CirceError } from '../../errors/circe-error.js';

/**
 * Raised for event discovery and loading failures.
 *
 * @remarks
 * Individual event listener runtime execution failures are caught and isolated by
 * the dispatcher rather than terminating the Discord client. See {@link createEventHandler}.
 *
 * @public
 */
export class EventError extends CirceError {}
