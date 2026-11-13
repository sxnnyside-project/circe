---
name: circe-verify-changes
description: The ordered verification gate to run after changing a Circe bot, and how to read each result. Use before reporting any code change as finished.
circe-contract: 1
---

# Verify changes

Run these in order. Stop at the first failure, fix it, and restart from step 1.

| # | Command | Passes when | Fails with |
| :-: | :--- | :--- | :--- |
| 1 | `circe build --format json` | exit `0`, stdout `{ "ok": true, ... }` | exit `1` or `2`, stdout `{ "ok": false, "error": ... }` |
| 2 | `circe doctor --format json` | exit `0`, `ok` is `true` | exit `1`, failing items listed |
| 3 | `circe manifest` | exit `0` | structured error |
| 4 | `circe manifest --check` | exit `0`, `status` is `up-to-date` | exit `1`, `status` is `stale` or `missing` |
| 5 | the project's own test script | exit `0` | project-defined |

## What each step proves

1. `build` loads `circe.config.ts`, imports every module, and validates shapes and identity collisions. It never connects to Discord and needs no live credentials beyond the declared environment variables.
2. `doctor` checks the runtime version, configuration, environment variables, and dependency alignment.
3. `manifest` regenerates `.circe/project.json` so the committed summary matches the code.
4. `manifest --check` is the CI form of step 3: it never writes, and fails when the manifest was not regenerated.

## Rules

- Read the exit code first, then the JSON. Exit `0` means success; `1` is an expected failure you can fix; `2` is a usage error or an internal defect.
- With `--format json`, success and failure are both one JSON document on stdout. Do not scrape stderr.
- Commit `.circe/project.json` with the change that altered the routes.
- Never run `circe start` to verify a change. It logs in to Discord.
- `circe dev` and `circe start` are long-running and do not emit a JSON document.

## Reporting

State which steps ran and their exit codes. If a step was skipped, say why. Do not claim success on a step that was not run.

