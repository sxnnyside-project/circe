/** Discord interaction payloads are a few KB; this caps what an unauthenticated caller can make the server buffer. */
export const MAX_REQUEST_BODY_BYTES = 1_000_000;
