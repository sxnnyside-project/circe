import { CirceError } from "../../errors/circe-error.js";

/** Raised for command registry, discovery, and Discord-registration failures. */
export class CommandError extends CirceError {}
