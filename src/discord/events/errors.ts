import { CirceError } from "../../errors/circe-error.js";

/** Raised for event discovery/loading failures. Handler execution failures are logged, not thrown — see dispatcher.ts. */
export class EventError extends CirceError {}
