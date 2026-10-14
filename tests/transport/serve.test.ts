import { describe, expect, test } from 'bun:test';
import { Client } from 'discord.js';
import { createLogger } from '../../src/logging/logger.js';
import { createInteractionsHandler } from '../../src/transport/http-handler.js';
import { createNodeInteractionsServer } from '../../src/transport/serve.js';

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

const logger = createLogger({ sink: () => {} });

/**
 * This exercises the `node:http` bridge directly — real sockets, a real
 * server, a real HTTP client — rather than the `startInteractionsServer`
 * dispatcher, since `detectRuntime()` reports "bun" while these tests run
 * (Bun's own runtime), and the Node code path is exactly the one with no
 * native "serve a fetch handler" API to lean on, so it's the one most
 * likely to have a bug in the request/response bridging.
 */
describe('createNodeInteractionsServer', () => {
  test('reports a port that is already in use instead of crashing with a raw exception', async () => {
    const first = createNodeInteractionsServer({
      port: 39230,
      fetch: async () => new Response(null),
      logger,
    });
    const errors: Error[] = [];
    const previousExitCode = process.exitCode;
    const second = createNodeInteractionsServer({
      port: 39230,
      fetch: async () => new Response(null),
      logger,
      onListenError: (error) => errors.push(error),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      expect(errors).toHaveLength(1);
      expect((errors[0] as NodeJS.ErrnoException).code).toBe('EADDRINUSE');
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode ?? 0;
      first.stop();
      second.stop();
    }
  });

  test('answers a real signed PING over a real socket with an inline Pong', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });
    const port = 39217;
    const server = createNodeInteractionsServer({ port, fetch: handler, logger });

    try {
      const timestamp = FRESH_TIMESTAMP;
      const body = JSON.stringify({ type: 1 });
      const signature = await sign(keyPair.privateKey, timestamp, body);

      const response = await fetch(`http://localhost:${port}/interactions`, {
        method: 'POST',
        headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
        body,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ type: 1 });
    } finally {
      server.stop();
      client.destroy();
    }
  });

  test('rejects an invalid signature over a real socket with 401', async () => {
    const { publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });
    const port = 39218;
    const server = createNodeInteractionsServer({ port, fetch: handler, logger });

    try {
      const response = await fetch(`http://localhost:${port}/interactions`, {
        method: 'POST',
        headers: {
          'x-signature-ed25519': 'aa'.repeat(64),
          'x-signature-timestamp': FRESH_TIMESTAMP,
        },
        body: JSON.stringify({ type: 1 }),
      });

      expect(response.status).toBe(401);
    } finally {
      server.stop();
      client.destroy();
    }
  });

  test('dispatches a real interaction and acknowledges with 202/no body over a real socket', async () => {
    const { keyPair, publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });
    const port = 39219;
    const server = createNodeInteractionsServer({ port, fetch: handler, logger });

    try {
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
      const body = JSON.stringify(payload);
      const timestamp = FRESH_TIMESTAMP;
      const signature = await sign(keyPair.privateKey, timestamp, body);

      const response = await fetch(`http://localhost:${port}/interactions`, {
        method: 'POST',
        headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
        body,
      });

      expect(response.status).toBe(202);
      expect(await response.text()).toBe('');
    } finally {
      server.stop();
      client.destroy();
    }
  });

  test('answers 413 for a body over the cap without buffering it', async () => {
    const { publicKey } = await generateKeyPair();
    const client = new Client({ intents: [] });
    const handler = createInteractionsHandler({ client, publicKey, logger });
    const port = 39219;
    const server = createNodeInteractionsServer({ port, fetch: handler, logger });

    try {
      const response = await fetch(`http://localhost:${port}/interactions`, {
        method: 'POST',
        body: 'x'.repeat(1_000_001),
      });

      expect(response.status).toBe(413);
    } finally {
      server.stop();
      client.destroy();
    }
  });
});
