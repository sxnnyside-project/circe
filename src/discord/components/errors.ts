import { CirceError } from '../../errors/circe-error.js';

/**
 * Raised for component handler discovery, registry collisions, execution, or routing failures.
 *
 * @public
 */
export class ComponentError extends CirceError {}
