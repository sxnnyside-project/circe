import { describe, expect, test } from 'bun:test';
import {
  defineIntegration,
  IntegrationError,
  resolveIntegrations,
} from '../../src/config/integration.js';

describe('resolveIntegrations', () => {
  test('returns empty scan roots and hooks when no integrations are given', async () => {
    const resolved = await resolveIntegrations();

    expect(resolved.scanRoots.commands).toEqual([]);
    expect(resolved.scanRoots['command-groups']).toEqual([]);
    expect(resolved.scanRoots['context-menus']).toEqual([]);
    expect(resolved.scanRoots.events).toEqual([]);
    expect(resolved.scanRoots.components).toEqual([]);
    expect(resolved.scanRoots.modals).toEqual([]);
    expect(resolved.onStartHooks).toEqual([]);
    expect(resolved.onStopHooks).toEqual([]);
    expect(resolved.onReadyHooks).toEqual([]);
    expect(resolved.intervals).toEqual([]);
  });

  test('collects a scan root contributed to the correct category only', async () => {
    const integration = defineIntegration({
      name: 'vendor-commands',
      setup(ctx) {
        ctx.addScanRoot('commands', '/vendor/commands');
      },
    });

    const resolved = await resolveIntegrations([integration]);

    expect(resolved.scanRoots.commands).toEqual(['/vendor/commands']);
    expect(resolved.scanRoots.events).toEqual([]);
  });

  test('collects scan roots from multiple integrations in registration order', async () => {
    const a = defineIntegration({
      name: 'a',
      setup(ctx) {
        ctx.addScanRoot('commands', '/a/commands');
      },
    });
    const b = defineIntegration({
      name: 'b',
      setup(ctx) {
        ctx.addScanRoot('commands', '/b/commands');
      },
    });

    const resolved = await resolveIntegrations([a, b]);

    expect(resolved.scanRoots.commands).toEqual(['/a/commands', '/b/commands']);
  });

  test('collects onStart and onStop hooks without running them', async () => {
    let started = false;
    let stopped = false;

    const integration = defineIntegration({
      name: 'lifecycle',
      setup(ctx) {
        ctx.onStart(() => {
          started = true;
        });
        ctx.onStop(() => {
          stopped = true;
        });
      },
    });

    const resolved = await resolveIntegrations([integration]);

    expect(resolved.onStartHooks).toHaveLength(1);
    expect(resolved.onStopHooks).toHaveLength(1);
    expect(started).toBe(false);
    expect(stopped).toBe(false);
  });

  test("runs each integration's setup exactly once", async () => {
    let calls = 0;
    const integration = defineIntegration({
      name: 'counted',
      setup() {
        calls += 1;
      },
    });

    await resolveIntegrations([integration]);

    expect(calls).toBe(1);
  });

  test("wraps a throwing setup in IntegrationError, attributing the integration's name", async () => {
    const integration = defineIntegration({
      name: 'broken-integration',
      setup() {
        throw new Error('boom');
      },
    });

    try {
      await resolveIntegrations([integration]);
      throw new Error('expected resolveIntegrations to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect((error as IntegrationError).message).toContain('broken-integration');
      expect((error as IntegrationError).metadata.integration).toBe('broken-integration');
      expect((error as IntegrationError).cause).toBeInstanceOf(Error);
    }
  });

  test('stops resolving further integrations once one throws', async () => {
    let secondRan = false;
    const first = defineIntegration({
      name: 'first',
      setup() {
        throw new Error('boom');
      },
    });
    const second = defineIntegration({
      name: 'second',
      setup() {
        secondRan = true;
      },
    });

    await expect(resolveIntegrations([first, second])).rejects.toBeInstanceOf(IntegrationError);
    expect(secondRan).toBe(false);
  });

  test('collects onReady hooks contributed by an integration', async () => {
    const hook = () => {};
    const resolved = await resolveIntegrations([
      defineIntegration({
        name: 'needs-client',
        setup(ctx) {
          ctx.onReady(hook);
        },
      }),
    ]);

    expect(resolved.onReadyHooks).toEqual([hook]);
  });

  test('collects interval registrations contributed by an integration', async () => {
    const task = () => {};
    const resolved = await resolveIntegrations([
      defineIntegration({
        name: 'retention',
        setup(ctx) {
          ctx.every(60_000, task, { name: 'purge' });
        },
      }),
    ]);

    expect(resolved.intervals).toEqual([{ intervalMs: 60_000, task, options: { name: 'purge' } }]);
  });

  test('an invalid interval fails setup and names the integration', async () => {
    const integration = defineIntegration({
      name: 'bad-interval',
      setup(ctx) {
        ctx.every(0, () => {});
      },
    });

    await expect(resolveIntegrations([integration])).rejects.toThrow(/bad-interval/);
  });
});
