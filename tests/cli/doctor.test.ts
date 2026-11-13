import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderDoctorResult, runDoctor, semverGte } from '../../src/cli/doctor.js';
import { runInit } from '../../src/cli/init.js';

const DOCTOR_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-doctor');
let dir: string;
const originalEnv = { ...process.env };

beforeEach(async () => {
  await mkdir(DOCTOR_ROOT, { recursive: true });
  dir = await mkdtemp(path.join(DOCTOR_ROOT, 'test-'));
});

afterEach(async () => {
  process.env = { ...originalEnv };
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(DOCTOR_ROOT, { recursive: true, force: true });
});

describe('semverGte', () => {
  test('correctly evaluates semantic version ordering', () => {
    expect(semverGte('1.4.0', '1.4.0')).toBe(true);
    expect(semverGte('1.4.4', '1.4.0')).toBe(true);
    expect(semverGte('1.5.0', '1.4.0')).toBe(true);
    expect(semverGte('2.0.0', '1.4.0')).toBe(true);
    expect(semverGte('1.3.9', '1.4.0')).toBe(false);
    expect(semverGte('0.9.9', '1.4.0')).toBe(false);
    expect(semverGte('v22.18.0', '22.18.0')).toBe(true);
    expect(semverGte('22.17.9', '22.18.0')).toBe(false);
  });
});

describe('runDoctor', () => {
  test('flags missing circe.config.ts and missing environment variables in an empty folder', async () => {
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_CLIENT_ID;

    const result = await runDoctor(dir);

    expect(result.ok).toBe(false);
    const configFileDiag = result.diagnostics.find((d) => d.id === 'config:file');
    expect(configFileDiag).toBeDefined();
    expect(configFileDiag?.level).toBe('fail');

    const authDiag = result.diagnostics.find((d) => d.id === 'auth:token');
    expect(authDiag).toBeDefined();
    expect(authDiag?.level).toBe('warn');
  });

  test('passes validation in a properly scaffolded and configured project', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });

    process.env.DISCORD_TOKEN = 'super-secret-discord-bot-token-valid-length';
    process.env.DISCORD_CLIENT_ID = '123456789012345678';

    const result = await runDoctor(dir);

    expect(result.ok).toBe(true);
    expect(result.runtime.supported).toBe(true);

    const configDiag = result.diagnostics.find((d) => d.id === 'config:file');
    expect(configDiag?.level).toBe('pass');

    const envDiag = result.diagnostics.find((d) => d.id === 'env:schema');
    expect(envDiag?.level).toBe('pass');

    const tokenDiag = result.diagnostics.find((d) => d.id === 'auth:token');
    expect(tokenDiag?.level).toBe('pass');
  });

  test('fails the HTTP key check when http.publicKey is empty, even if DISCORD_PUBLIC_KEY is set', async () => {
    process.env.DISCORD_PUBLIC_KEY = 'a'.repeat(64);
    await writeFile(
      path.join(dir, 'circe.config.ts'),
      `export default { transport: 'http', http: { publicKey: '' }, config: { load: () => ({ token: 'x'.repeat(30) }) } };`,
    );

    const result = await runDoctor(dir);

    expect(result.diagnostics.find((d) => d.id === 'transport:security')?.level).toBe('fail');
    expect(result.diagnostics.find((d) => d.id === 'auth:token')?.level).toBe('pass');
  });

  test('catches missing required environment variables against schema', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });

    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_CLIENT_ID;

    const result = await runDoctor(dir);

    expect(result.ok).toBe(false);
    const envDiag = result.diagnostics.find((d) => d.id === 'env:schema');
    expect(envDiag?.level).toBe('fail');
    expect(envDiag?.message).toContain('DISCORD_TOKEN');
  });
});

describe('renderDoctorResult', () => {
  test('renders formatted diagnostic list with summary and recommendations', () => {
    const output = renderDoctorResult({
      ok: false,
      runtime: { name: 'bun', version: '1.4.0', supported: true },
      diagnostics: [
        {
          id: 'runtime:engine',
          title: 'Runtime Engine',
          level: 'pass',
          message: 'Running on Bun v1.4.0',
        },
        {
          id: 'config:file',
          title: 'Configuration File',
          level: 'fail',
          message: 'circe.config.ts not found',
          suggestion: 'Run circe init',
        },
      ],
    });

    expect(output).toContain('Circe Doctor');
    expect(output).toContain('✓ [Runtime Engine]');
    expect(output).toContain('✗ [Configuration File]');
    expect(output).toContain('Recommendation: Run circe init');
    expect(output).toContain('1 passed, 0 warnings, 1 failed');
  });
});
