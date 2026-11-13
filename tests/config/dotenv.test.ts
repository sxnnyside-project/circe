import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadDotEnv } from '../../src/config/dotenv.js';

let dir: string;
const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'circe-dotenv-'));
  delete process.env.TEST_DOTENV_KEY;
  delete process.env.TEST_EXISTING_KEY;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

describe('loadDotEnv', () => {
  test('loads variables from .env in the given directory', async () => {
    await writeFile(path.join(dir, '.env'), 'TEST_DOTENV_KEY=hello_from_env\n');
    loadDotEnv(dir);
    expect(process.env.TEST_DOTENV_KEY).toBe('hello_from_env');
  });

  test('never overrides a variable that is already set', async () => {
    process.env.TEST_EXISTING_KEY = 'already_set';
    await writeFile(path.join(dir, '.env'), 'TEST_EXISTING_KEY=from_file\n');
    loadDotEnv(dir);
    expect(process.env.TEST_EXISTING_KEY).toBe('already_set');
  });

  test('does nothing when there is no .env', async () => {
    expect(() => loadDotEnv(dir)).not.toThrow();
  });
});
