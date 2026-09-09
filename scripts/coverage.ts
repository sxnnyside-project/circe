#!/usr/bin/env bun
/**
 * `bun test --coverage`'s own text/lcov output mixes in every file the test
 * run happens to import — including the throwaway fixture modules that
 * module-loader/CLI tests write to the OS temp dir to exercise real
 * filesystem scanning. Bun 1.4's `coveragePathIgnorePatterns` bunfig option
 * does not currently filter these out (verified: setting it has no effect
 * on either the text table or the emitted lcov.info), so this script
 * post-processes lcov.info itself, keeping only `src/` records, and enforces
 * a minimum line/function coverage threshold on that filtered set.
 */

const THRESHOLD = { lines: 85, functions: 75 };

const proc = Bun.spawnSync(["bun", "test", "--coverage", "--coverage-reporter=lcov"], {
  stdout: "inherit",
  stderr: "inherit",
});

if (proc.exitCode !== 0) {
  process.exit(proc.exitCode ?? 1);
}

const lcov = await Bun.file("coverage/lcov.info").text();
const records = lcov.split(/^end_of_record$/m);

interface FileCoverage {
  path: string;
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
}

const files: FileCoverage[] = [];

for (const record of records) {
  const pathMatch = record.match(/^SF:(.+)$/m);
  if (!pathMatch) continue;
  const path = pathMatch[1].trim();
  if (!path.startsWith("src/")) continue;

  const linesFound = Number(record.match(/^LF:(\d+)$/m)?.[1] ?? 0);
  const linesHit = Number(record.match(/^LH:(\d+)$/m)?.[1] ?? 0);
  const functionsFound = Number(record.match(/^FNF:(\d+)$/m)?.[1] ?? 0);
  const functionsHit = Number(record.match(/^FNH:(\d+)$/m)?.[1] ?? 0);

  files.push({ path, linesFound, linesHit, functionsFound, functionsHit });
}

const totals = files.reduce(
  (acc, f) => ({
    linesFound: acc.linesFound + f.linesFound,
    linesHit: acc.linesHit + f.linesHit,
    functionsFound: acc.functionsFound + f.functionsFound,
    functionsHit: acc.functionsHit + f.functionsHit,
  }),
  { linesFound: 0, linesHit: 0, functionsFound: 0, functionsHit: 0 },
);

const linePct = totals.linesFound === 0 ? 100 : (totals.linesHit / totals.linesFound) * 100;
const fnPct = totals.functionsFound === 0 ? 100 : (totals.functionsHit / totals.functionsFound) * 100;

const under = files
  .map((f) => ({ ...f, pct: f.linesFound === 0 ? 100 : (f.linesHit / f.linesFound) * 100 }))
  .filter((f) => f.pct < THRESHOLD.lines)
  .sort((a, b) => a.pct - b.pct);

console.log("\nsrc/ coverage (fixture files under tmp/.tmp-test-cli excluded):");
console.log(`  lines:     ${linePct.toFixed(2)}% (${totals.linesHit}/${totals.linesFound})`);
console.log(`  functions: ${fnPct.toFixed(2)}% (${totals.functionsHit}/${totals.functionsFound})`);

if (under.length > 0) {
  console.log("\nFiles below the line-coverage threshold:");
  for (const f of under) {
    console.log(`  ${f.pct.toFixed(2)}%  ${f.path}`);
  }
}

const failed = linePct < THRESHOLD.lines || fnPct < THRESHOLD.functions;
if (failed) {
  console.error(
    `\nCoverage gate failed: requires >=${THRESHOLD.lines}% lines and >=${THRESHOLD.functions}% functions on src/.`,
  );
  process.exit(1);
}

console.log("\nCoverage gate passed.");
