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

const call = async (h: ReturnType<typeof handler>, path: string) => {
  const response = await h(new Request(`http://localhost${path}`));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

describe('health handler', () => {
  test('/health is liveness: 200 even while still starting', async () => {
    const result = await call(handler({}, { running: false, ready: false }), '/health');
    expect(result).toEqual({ status: 200, body: { status: 'alive' } });
  });

  test('/ready is 503 until the app is running', async () => {
    const result = await call(handler({}, { running: false }), '/ready');
    expect(result.status).toBe(503);
    expect(result.body.status).toBe('starting');
  });

  test('/ready is 503 while the gateway is not connected', async () => {
    const result = await call(handler({}, { ready: false }), '/ready');
    expect(result.status).toBe(503);
  });

  test('/ready ignores the gateway when none is expected', async () => {
    const result = await call(handler({}, { ready: false, expectGateway: false }), '/ready');
    expect(result.status).toBe(200);
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
    expect(result.body.checks).toEqual({ boom: 'failed', hang: 'failed' });
  });

  test('anything else is a 404', async () => {
    expect((await call(handler(), '/metrics')).status).toBe(404);
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
});
