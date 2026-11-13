import { CirceError } from '../../errors/circe-error.js';

/**
 * Raised for modal registry, discovery, validation, and routing failures.
 *
 * @remarks
 * Used by {@link ModalRegistry}, {@link loadModals}, and {@link handleModalInteraction}
 * when routing or processing modal submissions.
 *
 * @public
 */
export class ModalError extends CirceError {}
