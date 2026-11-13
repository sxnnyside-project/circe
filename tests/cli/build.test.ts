import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runBuild } from '../../src/cli/build.js';
import { runInit } from '../../src/cli/init.js';

const BUILD_ROOT = path.join(import.meta.dirname, '..', '..', '.tmp-test-build');
let dir: string;
const originalEnv = { ...process.env };
const originalExitCode = process.exitCode;
const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);
let stdout: string;
let stderr: string;

beforeEach(async () => {
  await mkdir(BUILD_ROOT, { recursive: true });
  dir = await mkdtemp(path.join(BUILD_ROOT, 'test-'));
  process.env.DISCORD_TOKEN = 'test-token-valid-01234567890123456789';
  process.env.DISCORD_CLIENT_ID = '123456789012345678';
  stdout = '';
  stderr = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
});

afterEach(async () => {
  process.stdout.write = originalStdout;
  process.stderr.write = originalStderr;
  process.exitCode = originalExitCode;
  process.env = { ...originalEnv };
  await rm(dir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(BUILD_ROOT, { recursive: true, force: true });
});

describe('runBuild --format json', () => {
  test('a passing build writes exactly one JSON summary to stdout and nothing else', async () => {
    await runInit(dir, { runtime: 'bun', template: 'standard' });

    await runBuild(dir, { json: true });

    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.summary.commands).toBeGreaterThanOrEqual(2);
    expect(stderr).toBe('');
    expect(process.exitCode).not.toBe(1);
  });

  test('a module violation becomes a structured error on stdout with exit code 1', async () => {
    await runInit(dir, { runtime: 'bun', template: 'minimal' });
    await writeFile(path.join(dir, 'src/commands/broken.ts'), 'export default { name: "x" };\n');

    await runBuild(dir, { json: true });

    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.category).toBe('module-validation');
    expect(parsed.error.exitCode).toBe(1);
    expect(
      parsed.error.issues.some((issue: { file: string }) => issue.file.includes('broken.ts')),
    ).toBe(true);
    expect(stderr).toBe('');
    expect(process.exitCode).toBe(1);
  });

  test('a missing circe.config.ts is categorized config-file', async () => {
    await runBuild(dir, { json: true });

    const parsed = JSON.parse(stdout);
    expect(parsed.error.category).toBe('config-file');
    expect(process.exitCode).toBe(1);
  });

  test('text mode keeps the human block on stderr and leaves stdout empty', async () => {
    await runBuild(dir);

    expect(stdout).toBe('');
    expect(stderr).toContain('✗');
    expect(process.exitCode).toBe(1);
  });
});
