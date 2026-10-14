// Installs the packed tarball into a clean project with one package manager and checks
// what a consumer gets: the `circe` binary runs and the entry points load. Needs a built dist/.
// Usage: node scripts/consumers.mjs <npm|pnpm|yarn-classic|yarn-berry|yarn-berry-pnp>
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Versions are pinned: corepack resolves them, so a new release cannot change this check.
const PNPM = ['corepack', 'pnpm@11.5.2'];
const YARN_CLASSIC = ['corepack', 'yarn@1.22.22'];
const YARN_BERRY = ['corepack', 'yarn@4.9.2'];

const MANAGERS = {
  npm: { install: [['npm', 'install']], bin: ['npx', '--no-install', 'circe'], node: ['node'] },
  pnpm: {
    install: [[...PNPM, 'install', '--no-frozen-lockfile']],
    bin: [...PNPM, 'exec', 'circe'],
    node: ['node'],
  },
  'yarn-classic': {
    install: [[...YARN_CLASSIC, 'install']],
    bin: [...YARN_CLASSIC, 'run', '--silent', 'circe'],
    node: ['node'],
  },
  'yarn-berry': {
    install: [[...YARN_BERRY, 'install']],
    bin: [...YARN_BERRY, 'run', 'circe'],
    node: ['node'],
    yarnrc: 'nodeLinker: node-modules\n',
  },
  'yarn-berry-pnp': {
    install: [[...YARN_BERRY, 'install']],
    bin: [...YARN_BERRY, 'run', 'circe'],
    node: [...YARN_BERRY, 'node'],
  },
};

const name = process.argv[2];
const manager = MANAGERS[name];
assert.ok(
  manager,
  `unknown package manager "${name}"; expected one of ${Object.keys(MANAGERS).join(', ')}`,
);

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function run(cwd, [command, ...args], options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    // CI makes pnpm and yarn berry refuse to create a lockfile; this project has none yet.
    env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false', CI: '' },
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${[command, ...args].join(' ')} exited ${result.status}\n${result.stdout}${result.stderr}`,
  );
  return result.stdout;
}

const work = mkdtempSync(path.join(tmpdir(), `circe-consumer-${name}-`));
const packed = run(root, ['npm', 'pack', '--pack-destination', work, '--silent']).trim();
const consumer = path.join(work, 'project');
mkdirSync(consumer);

writeFileSync(
  path.join(consumer, 'package.json'),
  JSON.stringify({
    name: `consumer-${name}`,
    private: true,
    type: 'module',
    dependencies: {
      '@sxnnyside/circe': `file:${path.join(work, packed)}`,
      'discord.js': pkg.devDependencies['discord.js'],
      zod: pkg.devDependencies.zod,
    },
  }),
);
if (manager.yarnrc) {
  writeFileSync(path.join(consumer, '.yarnrc.yml'), manager.yarnrc);
}

for (const command of manager.install) {
  run(consumer, command);
}

const version = run(consumer, [...manager.bin, '--version']).trim();
assert.equal(version, `circe ${pkg.version}`, `the circe binary printed "${version}"`);

const check = `
  for (const specifier of ['@sxnnyside/circe', '@sxnnyside/circe/testing']) {
    const exports = await import(specifier);
    if (Object.keys(exports).length === 0) throw new Error(specifier + ' exports nothing');
  }
`;
run(consumer, [...manager.node, '--input-type=module', '-e', check]);

// The generated project must pass the build check with this manager's own binary.
// Node before 22.18 only runs TypeScript behind a flag, which the CLI cannot ask for itself.
const [major, minor] = process.versions.node.split('.').map(Number);
const nativeTypeScript = major > 22 || (major === 22 && minor >= 18);
const env = nativeTypeScript ? {} : { NODE_OPTIONS: '--experimental-strip-types' };
run(consumer, [...manager.bin, 'init']);
run(consumer, [...manager.bin, 'build'], {
  env: {
    ...process.env,
    ...env,
    YARN_ENABLE_IMMUTABLE_INSTALLS: 'false',
    CI: '',
    DISCORD_TOKEN: 'x',
  },
});

console.log(`consumer ok with ${name}: circe ${pkg.version}`);
