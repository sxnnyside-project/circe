/**
 * Makes `@sxnnyside/circe` resolvable from the projects the tests scaffold under `.tmp-test-*`.
 *
 * @remarks
 * A scaffolded `circe.config.ts` imports the package by name. A fresh checkout has no such entry in
 * `node_modules`, so those imports fail until something links it. Pointing the entries at `src`
 * (instead of `dist`) means no build is needed first, and the scaffolded code shares one copy of the
 * framework with the tests that drive it.
 */
import { lstatSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packageDir = path.join(root, 'node_modules', '@sxnnyside', 'circe');
const marker = path.join(packageDir, '.circe-test-shim');

function linkPackageToSource(): void {
  const existing = lstatSync(packageDir, { throwIfNoEntry: false });
  if (existing?.isSymbolicLink()) {
    // A link to the repository root resolves through `dist`, which may be missing or stale.
    unlinkSync(packageDir);
  } else if (existing) {
    // Already our shim, or a real directory that is not ours: either way, leave it.
    return;
  }

  mkdirSync(packageDir, { recursive: true });
  symlinkSync(path.join(root, 'src'), path.join(packageDir, 'src'), 'dir');
  writeFileSync(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify(
      {
        name: '@sxnnyside/circe',
        type: 'module',
        exports: {
          '.': './src/index.ts',
          './testing': './src/testing.ts',
          './cli': './src/cli.ts',
          './sqlite': './src/sqlite.ts',
          './bun-sqlite': './src/bun-sqlite.ts',
          './package.json': './package.json',
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(marker, 'created by tests/preload.ts\n');
}

linkPackageToSource();
