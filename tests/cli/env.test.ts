import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadDotEnv } from '../../src/cli/env.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'circe-env-'));
});

afterEach(async () => {
  delete process.env.CIRCE_TEST_FROM_FILE;
  delete process.env.CIRCE_TEST_ALREADY_SET;
  await rm(dir, { recursive: true, force: true });
});

describe('loadDotEnv', () => {
  test('loads variables from .env in the given directory', async () => {
    await writeFile(path.join(dir, '.env'), 'CIRCE_TEST_FROM_FILE=from-file\n', 'utf8');

    loadDotEnv(dir);

    expect(process.env.CIRCE_TEST_FROM_FILE).toBe('from-file');
  });

  test('never overrides a variable that is already set', async () => {
    process.env.CIRCE_TEST_ALREADY_SET = 'from-environment';
    await writeFile(path.join(dir, '.env'), 'CIRCE_TEST_ALREADY_SET=from-file\n', 'utf8');

    loadDotEnv(dir);

    expect(process.env.CIRCE_TEST_ALREADY_SET).toBe('from-environment');
  });

  test('does nothing when there is no .env', () => {
    expect(() => loadDotEnv(dir)).not.toThrow();
  });
});
