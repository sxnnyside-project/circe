import { type Client, InteractionResponseType, InteractionType } from 'discord.js';
import type { Logger } from '../logging/logger.js';
import { dispatchInteraction } from './interaction-bridge.js';
import { MAX_REQUEST_BODY_BYTES } from './limits.js';
import {
  DISCORD_SIGNATURE_HEADER,
  DISCORD_TIMESTAMP_HEADER,
  verifyDiscordSignature,
} from './verify-signature.js';

/**
 * Options for configuring the Discord Interactions HTTP request handler.
 *
 * @public
 */
export interface InteractionsHttpHandlerOptions {
  /** Discord.js Client instance through which interactions are dispatched. */
  readonly client: Client;

  /** Hex-encoded Ed25519 public key from the Discord Developer Portal. */
  readonly publicKey: string;

  /** Logger for recording transport rejections and diagnostics. */
  readonly logger: Logger;

  /**
   * Largest accepted gap in seconds between request timestamp and current system time.
   * Together with the duplicate-interaction check, protects against replay attacks.
   *
   * @defaultValue `300`
   */
  readonly maxTimestampSkewSeconds?: number;
}

const DEFAULT_MAX_TIMESTAMP_SKEW_SECONDS = 300;

/** Reads the body up to the cap, so an unauthenticated caller cannot make the server buffer an arbitrary amount. */
async function readCappedBody(request: Request): Promise<string | undefined> {
  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_REQUEST_BODY_BYTES || !request.body) {
    return declared > MAX_REQUEST_BODY_BYTES ? undefined : '';
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.length;
    if (received > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(body);
}

/**
 * A standard `(Request) => Promise<Response>` handler for Discord's HTTP
 * Interactions Endpoint URL — the same Fetch API contract `Bun.serve`,
 * Node 22+, and `Deno.serve` all accept, so this function is the entire
 * HTTP transport surface regardless of which runtime hosts it.
 *
 * @remarks
 * Every non-`PING` interaction is fed into the normal `Client` event
 * pipeline via `dispatchInteraction` and acknowledged with `202`/no body —
 * Discord explicitly allows sending the real response later via the
 * interaction callback REST endpoint, which is exactly what `interaction.reply()`
 * already does inside Circe's existing routers. `PING` is the one
 * exception the endpoint-verification handshake requires: it must be
 * answered inline, in the original response body.
 *
 * @example
 * ```ts
 * const handler = createInteractionsHandler({
 *   client,
 *   publicKey: env.DISCORD_PUBLIC_KEY,
 *   logger,
 * });
 * ```
 *
 * @param options - Interaction HTTP transport options.
 * @returns Web Fetch API compatible async request handler.
 * @public
 */
export function createInteractionsHandler(
  options: InteractionsHttpHandlerOptions,
): (request: Request) => Promise<Response> {
  const maxSkewSeconds = options.maxTimestampSkewSeconds ?? DEFAULT_MAX_TIMESTAMP_SKEW_SECONDS;
  // Insertion order is expiry order (constant TTL), so sweeping stops at the first live entry.
  const seenInteractions = new Map<string, number>();

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    }

    const signature = request.headers.get(DISCORD_SIGNATURE_HEADER);
    const timestamp = request.headers.get(DISCORD_TIMESTAMP_HEADER);

    // Before the body is buffered: an unsigned request costs nothing.
    if (!signature || !timestamp) {
      options.logger.warn('Rejected interaction request missing signature headers');
      return new Response('Missing signature headers', { status: 401 });
    }

    const body = await readCappedBody(request);
    if (body === undefined) {
      return new Response('Payload too large', { status: 413 });
    }

    const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!(skew <= maxSkewSeconds)) {
      options.logger.warn('Rejected interaction request with a stale or malformed timestamp', {
        skewSeconds: Math.round(skew),
      });
      return new Response('Stale request timestamp', { status: 401 });
    }

    const valid = await verifyDiscordSignature({
      publicKey: options.publicKey,
      signature,
      timestamp,
      body,
    });
    if (!valid) {
      options.logger.warn('Rejected interaction request with an invalid signature');
      return new Response('Invalid request signature', { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response('Invalid JSON body', { status: 400 });
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as { type?: unknown }).type !== 'number'
    ) {
      return new Response('Invalid interaction payload', { status: 400 });
    }

    const interactionPayload = payload as { type: number; id?: unknown };

    if (interactionPayload.type === InteractionType.Ping) {
      return Response.json({ type: InteractionResponseType.Pong });
    }

    // A signature stays valid for the whole freshness window, so a captured request
    // would otherwise run its command again; the interaction id is unique per delivery.
    if (typeof interactionPayload.id === 'string') {
      const now = Date.now();
      for (const [id, expiresAt] of seenInteractions) {
        if (expiresAt > now) {
          break;
        }
        seenInteractions.delete(id);
      }
      if (seenInteractions.has(interactionPayload.id)) {
        options.logger.warn('Rejected a replayed interaction request');
        return new Response('Replayed interaction', { status: 409 });
      }
      seenInteractions.set(interactionPayload.id, now + 2 * maxSkewSeconds * 1000);
    }

    dispatchInteraction(options.client, interactionPayload);
    return new Response(null, { status: 202 });
  };
}
