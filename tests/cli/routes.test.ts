import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { runInit } from '../../src/cli/init.js';
import { renderRoutesReport, runRoutes } from '../../src/cli/routes.js';

const ROUTES_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-routes');
let dir: string;
const originalEnv = { ...process.env };

beforeEach(async () => {
  await mkdir(ROUTES_ROOT, { recursive: true });
  dir = await mkdtemp(path.join(ROUTES_ROOT, 'test-'));
  process.env.DISCORD_TOKEN = 'test-token-valid-01234567890123456789';
  process.env.DISCORD_CLIENT_ID = '123456789012345678';
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(ROUTES_ROOT, { recursive: true, force: true });
});

describe('runRoutes', () => {
  test('discovers all interaction routes in a minimal project', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });

    const report = await runRoutes(dir);

    expect(report.total).toBe(1);
    expect(report.routes[0]?.kind).toBe('command');
    expect(report.routes[0]?.name).toBe('/ping');
  });

  test('discovers slash commands, subcommands, context menus, modals, components, and events in advanced project', async () => {
    await runInit(dir, { runtime: 'bun', template: 'advanced' });

    const report = await runRoutes(dir);

    expect(report.total).toBeGreaterThanOrEqual(6);

    const kinds = new Set(report.routes.map((r) => r.kind));
    expect(kinds.has('command')).toBe(true);
    expect(kinds.has('subcommand')).toBe(true);
    expect(kinds.has('user-context-menu')).toBe(true);
    expect(kinds.has('message-context-menu')).toBe(true);
    expect(kinds.has('modal')).toBe(true);
    expect(kinds.has('component')).toBe(true);
    expect(kinds.has('event')).toBe(true);

    const kickRoute = report.routes.find((r) => r.name.includes('kick'));
    expect(kickRoute).toBeDefined();
    expect(kickRoute?.kind).toBe('subcommand');
    expect(kickRoute?.guards).toBeGreaterThanOrEqual(1);

    const modalRoute = report.routes.find((r) => r.kind === 'modal');
    expect(modalRoute?.name).toBe('feedback-modal');
  });
});

describe('renderRoutesReport', () => {
  test('renders formatted table with headers and summary', async () => {
    await runInit(dir, { runtime: 'bun', template: 'standard' });
    const report = await runRoutes(dir);

    const output = renderRoutesReport(report);

    expect(output).toContain('Circe Interaction Routes');
    expect(output).toContain('KIND');
    expect(output).toContain('NAME / PATTERN');
    expect(output).toContain('/ping');
    expect(output).toContain('/help');
    expect(output).toContain('Total routes discovered:');
  });
});
