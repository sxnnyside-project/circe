import { Buffer } from 'node:buffer';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Logger } from '../logging/logger.js';
import { detectRuntime } from '../runtime/detect.js';
import { MAX_REQUEST_BODY_BYTES } from './limits.js';

/**
 * Thrown when the inbound request body exceeds MAX_REQUEST_BODY_BYTES.
 * @internal
 */
export class RequestBodyTooLargeError extends Error {}

/**
 * Options for configuring and starting the HTTP Interactions Endpoint server.
 *
 * @public
 */
export interface InteractionsServerOptions {
  /** Port the HTTP interactions server listens on. */
  readonly port: number;

  /**
   * Interface to bind.
   *
   * @defaultValue All interfaces (`"0.0.0.0"` or `"::"`).
   */
  readonly host?: string;

  /** Portable Web Fetch request-to-response handler. */
  readonly fetch: (request: Request) => Promise<Response>;

  /** Logger instance for recording startup, shutdown, and request errors. */
  readonly logger: Logger;

  /**
   * Names the server in its startup log line.
   *
   * @defaultValue `"HTTP interactions server"`
   */
  readonly label?: string;

  /**
   * Called when the server cannot listen (e.g. port already in use). Supported across
   * all runtimes (Bun, Node 22+, Deno 2+). Sets exit code 1 before invoking this callback.
   *
   * @defaultValue `undefined`
   */
  readonly onListenError?: (error: Error) => void;
}

/**
 * Handle to a running HTTP interactions server.
 *
 * @public
 */
export interface InteractionsServer {
  /**
   * Stops the server and closes all active sockets.
   */
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

function getBunGlobal(): BunServeNamespace | undefined {
  return (globalThis as { Bun?: BunServeNamespace }).Bun;
}

function getDenoGlobal(): DenoServeNamespace | undefined {
  return (globalThis as { Deno?: DenoServeNamespace }).Deno;
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
        // Stop buffering but keep the socket: destroying it here would cut off the 413 reply.
        chunks.length = 0;
        request.removeAllListeners('data');
        reject(new RequestBodyTooLargeError());
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
 *
 * @internal
 * @param options - Server configuration options.
 * @returns Active `InteractionsServer` handle.
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
          // The rest of the oversized body is never read, so the connection cannot be reused.
          response.writeHead(413, { Connection: 'close' });
          response.end(() => request.destroy());
          return;
        }
        options.logger.error('Interactions server request failed', { error });
        response.statusCode = 500;
        response.end();
      });
  });

  // Without a listener a bind failure (port in use) surfaces as a raw uncaught exception.
  server.once('error', (error: NodeJS.ErrnoException) => {
    options.logger.error(
      `${options.label ?? 'HTTP interactions server'} could not listen on port ${options.port}`,
      { error, code: error.code },
    );
    process.exitCode = 1;
    options.onListenError?.(error);
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
 *
 * @remarks
 * Runtime dispatch:
 * - Bun: Uses high-performance native `Bun.serve` with `maxRequestBodySize` cap.
 * - Deno: Uses `Deno.serve` with async `server.shutdown()` on stop.
 * - Node: Uses `node:http` bridge with streaming buffer size validation.
 *
 * @example
 * ```ts
 * const server = startInteractionsServer({
 *   port: 8787,
 *   fetch: interactionsHandler,
 *   logger,
 * });
 * // On shutdown:
 * server.stop();
 * ```
 *
 * @param options - Server configuration and fetch handler options.
 * @returns An `InteractionsServer` instance capable of graceful termination via `stop()`.
 * @throws Error If port binding fails or native runtime namespace is unavailable.
 * @public
 */
export function startInteractionsServer(options: InteractionsServerOptions): InteractionsServer {
  const runtime = detectRuntime();

  if (runtime === 'bun') {
    const bunGlobal = getBunGlobal();
    if (!bunGlobal) {
      throw new Error('Bun global not found despite detecting the Bun runtime.');
    }
    try {
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
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.logger.error(
        `${options.label ?? 'HTTP interactions server'} could not listen on port ${options.port}`,
        { error: err },
      );
      process.exitCode = 1;
      options.onListenError?.(err);
      throw err;
    }
  }

  if (runtime === 'deno') {
    const denoGlobal = getDenoGlobal();
    if (!denoGlobal) {
      throw new Error('Deno global not found despite detecting the Deno runtime.');
    }
    try {
      const server = denoGlobal.serve(
        { port: options.port, ...(options.host !== undefined ? { hostname: options.host } : {}) },
        options.fetch,
      );
      options.logger.info(
        `${options.label ?? 'HTTP interactions server'} listening on port ${options.port}`,
      );
      return { stop: () => void server.shutdown() };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options.logger.error(
        `${options.label ?? 'HTTP interactions server'} could not listen on port ${options.port}`,
        { error: err },
      );
      process.exitCode = 1;
      options.onListenError?.(err);
      throw err;
    }
  }

  return createNodeInteractionsServer(options);
}
