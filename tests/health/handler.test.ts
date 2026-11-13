import { describe, expect, test } from 'bun:test';
import { createHealthHandler, type HealthConfig } from '../../src/health/handler.js';
import { createLogger } from '../../src/logging/logger.js';

const logger = createLogger({ sink: () => {} });

function handler(
  config: Partial<HealthConfig> = {},
  state: { running?: boolean; ready?: boolean; expectGateway?: boolean } = {},
) {
  return createHealthHandler({
    client: { isReady: () => state.ready ?? true } as never,
    expectGateway: state.expectGateway ?? true,
    isRunning: () => state.running ?? true,
    config: { port: 0, ...config },
    logger,
  });
}

const call = async (h: ReturnType<typeof handler>, path: string, method = 'GET') => {
  const response = await h(new Request(`http://localhost${path}`, { method }));
  const text = await response.text();
  const body = text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null;
  return { status: response.status, body, headers: response.headers };
};

describe('health handler', () => {
  describe('Liveness probe (/health)', () => {
    test('/health is liveness: returns 200 even while still starting or disconnected from gateway', async () => {
      const result = await call(handler({}, { running: false, ready: false }), '/health');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ status: 'alive' });
      expect(result.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    });

    test('supports HEAD /health returning 200 with headers and empty body', async () => {
      const result = await call(handler(), '/health', 'HEAD');
      expect(result.status).toBe(200);
      expect(result.body).toBeNull();
      expect(result.headers.get('content-type')).toBe('application/json');
      expect(result.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    });
  });

  describe('Readiness probe (/ready)', () => {
    test('/ready is 503 starting until the app lifecycle finishes starting', async () => {
      const result = await call(handler({}, { running: false }), '/ready');
      expect(result.status).toBe(503);
      expect(result.body).toEqual({ status: 'starting' });
      expect(result.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    });

    test('/ready is 503 while the gateway is not connected', async () => {
      const result = await call(handler({}, { ready: false }), '/ready');
      expect(result.status).toBe(503);
      expect(result.body).toEqual({ status: 'starting' });
    });

    test('/ready ignores the gateway when none is expected (e.g. HTTP-only mode)', async () => {
      const result = await call(handler({}, { ready: false, expectGateway: false }), '/ready');
      expect(result.status).toBe(200);
      expect(result.body?.status).toBe('ready');
    });

    test('/ready reports each check and fails when one is not ok', async () => {
      const result = await call(
        handler({ checks: { db: () => true, upstream: async () => false } }),
        '/ready',
      );
      expect(result.status).toBe(503);
      expect(result.body).toEqual({
        status: 'unavailable',
        checks: { db: 'ok', upstream: 'failed' },
      });
    });

    test('a throwing or hanging check counts as failed', async () => {
      const result = await call(
        handler({
          checkTimeoutMs: 20,
          checks: {
            boom: () => {
              throw new Error('x');
            },
            hang: () => new Promise<boolean>(() => {}),
          },
        }),
        '/ready',
      );
      expect(result.body?.checks).toEqual({ boom: 'failed', hang: 'failed' });
    });

    test('/ready reuses a result for a second so a probe flood does not become a check flood', async () => {
      let runs = 0;
      const h = handler({
        checks: {
          db: () => {
            runs += 1;
            return true;
          },
        },
      });

      await Promise.all([call(h, '/ready'), call(h, '/ready'), call(h, '/ready')]);
      await call(h, '/ready');

      expect(runs).toBe(1);
    });

    test('supports HEAD /ready returning status and headers without body', async () => {
      const result = await call(handler(), '/ready', 'HEAD');
      expect(result.status).toBe(200);
      expect(result.body).toBeNull();
      expect(result.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    });
  });

  describe('HTTP semantics and error handling', () => {
    test('rejects methods other than GET and HEAD with 405 Method Not Allowed and Allow header', async () => {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        const response = await handler()(new Request('http://localhost/health', { method }));
        expect(response.status).toBe(405);
        expect(response.headers.get('allow')).toBe('GET, HEAD');
        expect(response.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
      }
    });

    test('returns 404 with no-store cache header for unknown paths', async () => {
      const result = await call(handler(), '/metrics');
      expect(result.status).toBe(404);
      expect(result.body).toEqual({ status: 'not-found' });
      expect(result.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    });
  });
});
