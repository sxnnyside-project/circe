// Loads the *built* package under whichever runtime runs this file, so a
// runtime-specific break in dist/ is caught even though the test suite is Bun-native.
import { strict as assert } from 'node:assert';

const dist = `../${globalThis.process?.env?.CIRCE_DIST ?? globalThis.Deno?.env.get('CIRCE_DIST') ?? 'dist'}`;
const lib = await import(`${dist}/index.js`);
const testing = await import(`${dist}/testing/index.js`);

for (const name of [
  'createCirce',
  'defineCommand',
  'defineEvent',
  'defineComponent',
  'defineModal',
  'defineConfig',
  'defineCirceConfig',
  'defineIntegration',
  'guildOnly',
  'hasPermission',
  'invokerOnly',
  'cooldown',
  'createPaginator',
]) {
  assert.equal(typeof lib[name], 'function', `dist/index.js is missing export "${name}"`);
}
assert.equal(
  typeof testing.testCommand,
  'function',
  'dist/testing/index.js is missing "testCommand"',
);

const runtime = globalThis.Deno ? 'deno' : globalThis.Bun ? 'bun' : 'node';
console.log(`smoke ok on ${runtime}`);
