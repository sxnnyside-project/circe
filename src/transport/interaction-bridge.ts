import type { Client } from "discord.js";

interface InteractionCreateAction {
  handle(data: unknown): void;
}

interface ClientWithActions {
  actions: { InteractionCreate: InteractionCreateAction };
}

/**
 * Feeds a raw Discord interaction payload — identical in shape whether
 * received over Gateway or HTTP — into discord.js's own interaction
 * construction pipeline (`client.actions.InteractionCreate.handle`). This
 * is the exact code path discord.js uses internally for every
 * gateway-delivered interaction: it builds the real `ChatInputCommandInteraction`
 * (or button/modal/context-menu equivalent) and emits `Events.InteractionCreate`
 * on `client`, so every router Circe already has attaches and behaves
 * identically regardless of transport.
 *
 * `client.actions` is not part of discord.js's public API — its own type
 * declarations mark it `private`. This function is the one place in Circe
 * that depends on that internal rather than documented API, deliberately
 * isolated here so the risk has a single, visible surface. It is covered
 * by a test that exercises it against the real installed discord.js — if
 * a future version restructures `actions`, that test fails loudly in CI
 * instead of this breaking silently in production.
 */
export function dispatchInteraction(client: Client, data: unknown): void {
  (client as unknown as ClientWithActions).actions.InteractionCreate.handle(data);
}
