import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Logger } from '../logging/logger.js';
import { detectRuntime } from '../runtime/detect.js';
import { MAX_REQUEST_BODY_BYTES } from './limits.js';

export class RequestBodyTooLargeError extends Error {}

export interface InteractionsServerOptions {
  readonly port: number;
  /** Interface to bind. Defaults to the runtime's own default (all interfaces). */
  readonly host?: string;
  readonly fetch: (request: Request) => Promise<Response>;
  readonly logger: Logger;
  /** Names the server in its startup log line. Defaults to `"HTTP interactions server"`. */
  readonly label?: string;
}

export interface InteractionsServer {
  stop(): void;
}

interface BunServeNamespace {
  serve(options: {
    port: number;
    hostname?: string;
    maxRequestBodySize?: number;
    fetch: (request: Request) => Promise<Response>;
  }): {
    stop(): void;
  };
}

interface DenoServeNamespace {
  serve(
    options: { port: number; hostname?: string; onListen?: () => void },
    handler: (request: Request) => Promise<Response>,
  ): { shutdown(): Promise<void> };
}

function nodeRequestToWebRequest(request: IncomingMessage): Promise<Request> {
  const url = `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const method = request.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  if (!hasBody) {
    return Promise.resolve(new Request(url, { method, headers }));
  }

  const declared = Number(request.headers['content-length']);
  if (declared > MAX_REQUEST_BODY_BYTES) {
    return Promise.reject(new RequestBodyTooLargeError());
  }

  const chunks: Buffer[] = [];
  let received = 0;
  return new Promise((resolve, reject) => {
    request.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_REQUEST_BODY_BYTES) {
        reject(new RequestBodyTooLargeError());
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      resolve(new Request(url, { method, headers, body: Buffer.concat(chunks), duplex: 'half' }));
    });
    request.on('error', reject);
  });
}

async function writeWebResponseToNode(
  response: Response,
  nodeResponse: ServerResponse,
): Promise<void> {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : undefined;
  nodeResponse.end(body);
}

/**
 * Hosts a portable `(Request) => Promise<Response>` handler on Node's
 * built-in `http` module — the one runtime here without a native
 * "serve this fetch handler" API of its own (Bun and Deno both have one).
 * Isolated and exported separately from `startInteractionsServer` so it
 * can be exercised directly in tests regardless of which runtime is
 * actually detected.
 */
export function createNodeInteractionsServer(
  options: InteractionsServerOptions,
): InteractionsServer {
  const server = createServer((request, response) => {
    void nodeRequestToWebRequest(request)
      .then((webRequest) => options.fetch(webRequest))
      .then((webResponse) => writeWebResponseToNode(webResponse, response))
      .catch((error: unknown) => {
        if (error instanceof RequestBodyTooLargeError) {
          response.statusCode = 413;
          response.end();
          return;
        }
        options.logger.error('Interactions server request failed', { error });
        response.statusCode = 500;
        response.end();
      });
  });

  server.listen(options.port, options.host);
  options.logger.info(
    `${options.label ?? 'HTTP interactions server'} listening on port ${options.port}`,
  );

  return { stop: () => server.close() };
}

/**
 * Starts the HTTP Interactions Endpoint server, hosting the portable
 * `createInteractionsHandler` output on whichever runtime is detected:
 * `Bun.serve` on Bun, `Deno.serve` on Deno, and a `node:http` bridge on
 * Node — the same handler function runs unmodified on all three.
 */
export function startInteractionsServer(options: InteractionsServerOptions): InteractionsServer {
  const runtime = detectRuntime();

  if (runtime === 'bun') {
    const bunGlobal = (globalThis as { Bun?: BunServeNamespace }).Bun;
    if (!bunGlobal) {
      throw new Error('Bun global not found despite detecting the Bun runtime.');
    }
    const server = bunGlobal.serve({
      port: options.port,
      ...(options.host !== undefined ? { hostname: options.host } : {}),
      maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
      fetch: options.fetch,
    });
    options.logger.info(
      `${options.label ?? 'HTTP interactions server'} listening on port ${options.port}`,
    );
    return { stop: () => server.stop() };
  }

  if (runtime === 'deno') {
    const denoGlobal = (globalThis as { Deno?: DenoServeNamespace }).Deno;
    if (!denoGlobal) {
      throw new Error('Deno global not found despite detecting the Deno runtime.');
    }
    const server = denoGlobal.serve(
      { port: options.port, ...(options.host !== undefined ? { hostname: options.host } : {}) },
      options.fetch,
    );
    options.logger.info(
      `${options.label ?? 'HTTP interactions server'} listening on port ${options.port}`,
    );
    return { stop: () => void server.shutdown() };
  }

  return createNodeInteractionsServer(options);
}
