import { type Client, InteractionResponseType, InteractionType } from "discord.js";
import type { Logger } from "../logging/logger.js";
import { dispatchInteraction } from "./interaction-bridge.js";
import { verifyDiscordSignature } from "./verify-signature.js";

export interface InteractionsHttpHandlerOptions {
  readonly client: Client;
  /** Hex-encoded ed25519 public key from the Discord Developer Portal. */
  readonly publicKey: string;
  readonly logger: Logger;
}

const SIGNATURE_HEADER = "x-signature-ed25519";
const TIMESTAMP_HEADER = "x-signature-timestamp";

/**
 * A standard `(Request) => Promise<Response>` handler for Discord's HTTP
 * Interactions Endpoint URL — the same Fetch API contract `Bun.serve`,
 * Node 22+, and `Deno.serve` all accept, so this function is the entire
 * HTTP transport surface regardless of which runtime hosts it.
 *
 * Every non-`PING` interaction is fed into the normal `Client` event
 * pipeline via `dispatchInteraction` and acknowledged with `202`/no body —
 * Discord explicitly allows sending the real response later via the
 * interaction callback REST endpoint, which is exactly what `interaction.reply()`
 * already does inside Circe's existing routers. `PING` is the one
 * exception the endpoint-verification handshake requires: it must be
 * answered inline, in the original response body.
 */
export function createInteractionsHandler(
  options: InteractionsHttpHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    const signature = request.headers.get(SIGNATURE_HEADER);
    const timestamp = request.headers.get(TIMESTAMP_HEADER);
    const body = await request.text();

    if (!signature || !timestamp) {
      options.logger.warn("Rejected interaction request missing signature headers");
      return new Response("Missing signature headers", { status: 401 });
    }

    const valid = await verifyDiscordSignature({ publicKey: options.publicKey, signature, timestamp, body });
    if (!valid) {
      options.logger.warn("Rejected interaction request with an invalid signature");
      return new Response("Invalid request signature", { status: 401 });
    }

    let payload: { type: number };
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    if (payload.type === InteractionType.Ping) {
      return Response.json({ type: InteractionResponseType.Pong });
    }

    dispatchInteraction(options.client, payload);
    return new Response(null, { status: 202 });
  };
}
