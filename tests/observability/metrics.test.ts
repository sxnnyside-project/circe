import { describe, expect, test } from 'bun:test';
import {
  createLatencyAccumulator,
  emitInteractionMetric,
  type InteractionMetric,
} from '../../src/observability/metrics.js';

describe('createLatencyAccumulator', () => {
  test('returns zeroed stats on an empty accumulator', () => {
    const acc = createLatencyAccumulator();
    const snap = acc.snapshot();
    expect(snap.total).toBe(0);
    expect(snap.errors).toBe(0);
    expect(snap.denied).toBe(0);
    expect(snap.minMs).toBe(0);
    expect(snap.maxMs).toBe(0);
    expect(snap.avgMs).toBe(0);
    expect(snap.p50Ms).toBe(0);
    expect(snap.p95Ms).toBe(0);
    expect(snap.p99Ms).toBe(0);
  });

  test('records metrics and computes accurate percentiles', () => {
    const acc = createLatencyAccumulator();
    // Record 100 durations from 1ms to 100ms
    for (let i = 1; i <= 100; i++) {
      acc.record({
        kind: 'command',
        name: 'test',
        status: i === 13 ? 'error' : i === 42 ? 'denied' : 'success',
        durationMs: i,
        correlationId: `corr-${i}`,
        guildId: 'guild-1',
        userId: 'user-1',
      });
    }

    const snap = acc.snapshot();
    expect(snap.total).toBe(100);
    expect(snap.errors).toBe(1);
    expect(snap.denied).toBe(1);
    expect(snap.minMs).toBe(1);
    expect(snap.maxMs).toBe(100);
    expect(snap.avgMs).toBe(50.5);
    expect(snap.p50Ms).toBe(50);
    expect(snap.p95Ms).toBe(95);
    expect(snap.p99Ms).toBe(99);
  });

  test('evicts oldest samples when maxSamples limit is reached', () => {
    const acc = createLatencyAccumulator(3);
    const makeMetric = (durationMs: number): InteractionMetric => ({
      kind: 'component',
      name: 'button',
      status: 'success',
      durationMs,
      correlationId: 'c1',
      guildId: null,
      userId: 'u1',
    });

    acc.record(makeMetric(10));
    acc.record(makeMetric(20));
    acc.record(makeMetric(30));
    expect(acc.snapshot().minMs).toBe(10);

    // 4th sample evicts the 1st (10ms)
    acc.record(makeMetric(40));
    const snap = acc.snapshot();
    expect(snap.total).toBe(4);
    expect(snap.minMs).toBe(20);
    expect(snap.maxMs).toBe(40);
  });

  test('resets all samples and counters', () => {
    const acc = createLatencyAccumulator();
    acc.record({
      kind: 'modal',
      name: 'feedback',
      status: 'error',
      durationMs: 150,
      correlationId: 'c1',
      guildId: 'g1',
      userId: 'u1',
    });

    expect(acc.snapshot().total).toBe(1);
    acc.reset();
    expect(acc.snapshot().total).toBe(0);
    expect(acc.snapshot().errors).toBe(0);
    expect(acc.snapshot().maxMs).toBe(0);
  });
});

describe('emitInteractionMetric', () => {
  test('calls handler with given metric', async () => {
    let captured: InteractionMetric | undefined;
    const metric: InteractionMetric = {
      kind: 'command',
      name: 'ping',
      status: 'success',
      durationMs: 12.5,
      correlationId: 'c-test',
      guildId: 'g-1',
      userId: 'u-1',
    };

    await emitInteractionMetric((m) => {
      captured = m;
    }, metric);

    expect(captured).toEqual(metric);
  });

  test('safely catches error when handler throws without propagating', async () => {
    const warnings: string[] = [];
    const logger = {
      warn: (msg: string) => {
        warnings.push(msg);
      },
    };

    const metric: InteractionMetric = {
      kind: 'command',
      name: 'broken',
      status: 'error',
      durationMs: 5,
      correlationId: 'c2',
      guildId: null,
      userId: 'u2',
    };

    await expect(
      emitInteractionMetric(
        () => {
          throw new Error('Telemetry explosion');
        },
        metric,
        logger,
      ),
    ).resolves.toBeUndefined();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Interaction telemetry handler threw an unhandled error');
  });

  test('noop when handler is undefined', async () => {
    const metric: InteractionMetric = {
      kind: 'command',
      name: 'noop',
      status: 'success',
      durationMs: 1,
      correlationId: 'c3',
      guildId: null,
      userId: 'u3',
    };
    await expect(emitInteractionMetric(undefined, metric)).resolves.toBeUndefined();
  });
});
