import { describe, expect, test } from 'bun:test';
import { ChatInputCommandInteraction, Client, Events } from 'discord.js';
import { dispatchInteraction } from '../../src/transport/interaction-bridge.js';

/**
 * This test exercises `dispatchInteraction` against the real, installed
 * discord.js — not a mock — because the whole point of the risk this
 * function carries (depending on `Client#actions`, which discord.js's own
 * type declarations mark `private`) is that a future discord.js version
 * could restructure it silently. If that ever happens, this test is what
 * catches it, in CI, before it reaches a bot in production.
 */
describe('dispatchInteraction', () => {
  test('constructs a real ChatInputCommandInteraction and emits it on the client', async () => {
    const client = new Client({ intents: [] });

    const received = new Promise<unknown>((resolve) => {
      client.once(Events.InteractionCreate, resolve);
    });

    const payload = {
      id: '1',
      application_id: 'app-1',
      type: 2, // InteractionType.ApplicationCommand
      data: { id: 'cmd-1', name: 'ping', type: 1 }, // ApplicationCommandType.ChatInput
      guild_id: undefined,
      channel_id: 'channel-1',
      user: {
        id: 'user-1',
        username: 'tester',
        discriminator: '0',
        global_name: null,
        avatar: null,
      },
      token: 'interaction-token',
      version: 1,
      app_permissions: '0',
      locale: 'en-US',
      entitlements: [],
      authorizing_integration_owners: {},
    };

    dispatchInteraction(client, payload);

    const interaction = await received;
    expect(interaction).toBeInstanceOf(ChatInputCommandInteraction);
    expect((interaction as ChatInputCommandInteraction).commandName).toBe('ping');
    expect((interaction as ChatInputCommandInteraction).id).toBe('1');

    client.destroy();
  });

  test('does not emit for a PING payload — the caller handles PING inline before reaching this', async () => {
    const client = new Client({ intents: [] });
    let emitted = false;
    client.once(Events.InteractionCreate, () => {
      emitted = true;
    });

    dispatchInteraction(client, { type: 1 }); // InteractionType.Ping

    await new Promise((resolve) => setImmediate(resolve));
    expect(emitted).toBe(false);

    client.destroy();
  });
});
