import { describe, expect, test } from 'bun:test';
import { Client, Events } from 'discord.js';
import { createLogger } from '../../src/logging/logger.js';
import { createInteractionsHandler } from '../../src/transport/http-handler.js';

/** Within the handler's freshness window, and stable across one test run. */
const FRESH_TIMESTAMP = String(Math.floor(Date.now() / 1000));

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateKeyPair() {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as unknown as CryptoKeyPair;
  const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  return { keyPair, publicKey: bytesToHex(publicKeyRaw) };
}

async function sign(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
  const message = new TextEncoder().encode(timestamp + body);
  const signature = await crypto.subtle.sign('Ed25519', privateKey, message);
  return bytesToHex(signature);
}

async function signedRequest(
  keyPair: CryptoKeyPair,
  body: string,
  overrides: { timestamp?: string; signature?: string; method?: string } = {},
): Promise<Request> {
  const timestamp = overrides.timestamp ?? FRESH_TIMESTAMP;
  const signature = overrides.signature ?? (await sign(keyPair.privateKey, timestamp, body));

  return new Request('https://bot.example/interactions', {
    method: overrides.method ?? 'POST',
    headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
    body,
  });
}

const logger = createLogger({ sink: () => {} });

describe('createInteractionsHandler', () => {
  test('rejects a non-POST request with 405', async () => {
    const { publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const response = await handler(
      new Request('https://bot.example/interactions', { method: 'GET' }),
    );
    expect(response.status).toBe(405);
    client.destroy();
  });

  test('rejects a request missing signature headers with 401', async () => {
    const { publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const response = await handler(
      new Request('https://bot.example/interactions', { method: 'POST', body: '{}' }),
    );
    expect(response.status).toBe(401);
    client.destroy();
  });

  test('rejects a request with a genuinely invalid signature with 401', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const body = JSON.stringify({ type: 1 });
    const request = await signedRequest(keyPair, body, { signature: 'aa'.repeat(64) });
    const response = await handler(request);

    expect(response.status).toBe(401);
    client.destroy();
  });

  test("rejects a request whose body doesn't match what was signed", async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const signature = await sign(keyPair.privateKey, FRESH_TIMESTAMP, JSON.stringify({ type: 1 }));
    const request = new Request('https://bot.example/interactions', {
      method: 'POST',
      headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': FRESH_TIMESTAMP },
      body: JSON.stringify({ type: 2 }),
    });

    expect((await handler(request)).status).toBe(401);
    client.destroy();
  });

  test('rejects a validly-signed but malformed JSON body with 400', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const request = await signedRequest(keyPair, 'not json');
    const response = await handler(request);

    expect(response.status).toBe(400);
    client.destroy();
  });

  test('answers PING inline with 200 and a Pong body, without touching the client', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    let emitted = false;
    client.once(Events.InteractionCreate, () => {
      emitted = true;
    });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const request = await signedRequest(keyPair, JSON.stringify({ type: 1 }));
    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
    expect(emitted).toBe(false);
    client.destroy();
  });

  test('dispatches a real interaction to the client and acknowledges with 202/no body', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const received = new Promise<{ commandName: string }>((resolve) => {
      client.once(Events.InteractionCreate, (interaction) =>
        resolve(interaction as { commandName: string }),
      );
    });

    const payload = {
      id: '1',
      application_id: 'app-1',
      type: 2,
      data: { id: 'cmd-1', name: 'ping', type: 1 },
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

    const request = await signedRequest(keyPair, JSON.stringify(payload));
    const response = await handler(request);

    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
    expect((await received).commandName).toBe('ping');

    client.destroy();
  });

  test('rejects a correctly signed request whose timestamp is stale with 401', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 3600);

    const response = await handler(
      await signedRequest(keyPair, JSON.stringify({ type: 1 }), { timestamp: staleTimestamp }),
    );

    expect(response.status).toBe(401);
    client.destroy();
  });

  test('rejects a body over the size cap with 413, before any signature work', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });

    const response = await handler(await signedRequest(keyPair, 'x'.repeat(1_000_001)));

    expect(response.status).toBe(413);
    client.destroy();
  });
});
