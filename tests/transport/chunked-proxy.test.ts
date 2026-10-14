import { describe, expect, test } from 'bun:test';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from 'discord.js';
import { createLogger } from '../../src/logging/logger.js';
import { createInteractionsHandler } from '../../src/transport/http-handler.js';
import {
  createNodeInteractionsServer,
  type InteractionsServer,
  startInteractionsServer,
} from '../../src/transport/serve.js';

const logger = createLogger({ sink: () => {} });

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * A minimal real reverse proxy: it streams the incoming request to the
 * backend with `Transfer-Encoding: chunked` and no `Content-Length`, which is
 * what nginx/Traefik do for streamed or HTTP/2 bodies — the one shape the
 * `content-length` pre-check can never see.
 */
async function startChunkedProxy(backendPort: number): Promise<{ port: number; server: Server }> {
  const port = await freePort();
  const server = createServer((incoming, outgoing) => {
    const { 'content-length': _dropped, ...forwarded } = incoming.headers;
    const headers = {
      ...forwarded,
      host: `127.0.0.1:${backendPort}`,
      'transfer-encoding': 'chunked',
    };
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: backendPort,
        method: incoming.method,
        path: incoming.url,
        headers,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    upstream.on('error', () => {
      outgoing.statusCode = 502;
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { port, server };
}

async function signedPing(): Promise<{
  publicKey: string;
  headers: Record<string, string>;
  body: string;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as unknown as CryptoKeyPair;
  const publicKey = toHex(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = toHex(
    await crypto.subtle.sign(
      'Ed25519',
      keyPair.privateKey,
      new TextEncoder().encode(timestamp + body),
    ),
  );
  return {
    publicKey,
    body,
    headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp },
  };
}

const backends: {
  name: string;
  start: (port: number, fetch: (request: Request) => Promise<Response>) => InteractionsServer;
}[] = [
  {
    name: 'node:http bridge',
    start: (port, fetch) => createNodeInteractionsServer({ port, fetch, logger }),
  },
  {
    name: 'Bun.serve (startInteractionsServer)',
    start: (port, fetch) => startInteractionsServer({ port, fetch, logger }),
  },
];

describe.each(backends)(
  'chunked bodies without content-length behind a proxy — $name',
  ({ start }) => {
    async function withStack(
      run: (proxyPort: number, ping: Awaited<ReturnType<typeof signedPing>>) => Promise<void>,
    ) {
      const ping = await signedPing();
      const client = new Client({ intents: [] });
      const backendPort = await freePort();
      const backend = start(
        backendPort,
        createInteractionsHandler({ client, publicKey: ping.publicKey, logger }),
      );
      const proxy = await startChunkedProxy(backendPort);
      try {
        await run(proxy.port, ping);
      } finally {
        proxy.server.close();
        backend.stop();
        client.destroy();
      }
    }

    test('a small signed PING streamed as chunked is answered normally', async () => {
      await withStack(async (port, ping) => {
        const response = await fetch(`http://127.0.0.1:${port}/interactions`, {
          method: 'POST',
          headers: ping.headers,
          body: ping.body,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ type: 1 });
      });
    });

    test('an oversized chunked body is refused, and the endpoint keeps serving afterwards', async () => {
      await withStack(async (port, ping) => {
        const huge = new Uint8Array(3_000_000);
        const refused = await fetch(`http://127.0.0.1:${port}/interactions`, {
          method: 'POST',
          headers: ping.headers,
          body: huge,
        }).then(
          (response) => response.status,
          () => 'connection-error' as const,
        );

        // A 401 here would mean the whole body was buffered before being refused.
        expect([413, 502, 'connection-error']).toContain(refused);

        const after = await fetch(`http://127.0.0.1:${port}/interactions`, {
          method: 'POST',
          headers: ping.headers,
          body: ping.body,
        });
        expect(after.status).toBe(200);
      });
    });
  },
);
