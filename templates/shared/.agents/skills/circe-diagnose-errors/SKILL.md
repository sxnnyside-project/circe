---
name: circe-diagnose-errors
description: Interpret Circe's structured error JSON and exit codes and choose the fix. Use whenever a circe command exits non-zero or prints a JSON document with "ok": false.
circe-contract: 1
---

# Diagnose Circe errors

Re-run the failing command with `--format json`. A failure is one document on stdout:

```json
{
  "ok": false,
  "error": {
    "name": "ModuleValidationError",
    "category": "module-validation",
    "message": "1 command module issue(s) found",
    "operational": true,
    "exitCode": 1,
    "issues": [{ "file": "ban.ts", "message": "missing `builder`" }],
    "metadata": { "category": "commands" }
  }
}
```

## Exit codes

| Code | Meaning | Action |
| :-: | :--- | :--- |
| `0` | Success | none |
| `1` | Expected failure (`operational: true`) | fix the file or configuration named in the error |
| `2` | Usage error, or an internal defect (`operational: false`) | correct the invocation; if `category` is `internal`, report it with `stack` instead of editing code to hide it |

## Fields

- `category` is the stable branch key. Do not branch on `message`.
- `issues` lists every aggregated problem. Fix all of them before re-running; they are reported in one pass.
- `issues[].file` is relative to the scanned category folder. `issues[].path` is a dotted configuration key.
- `file` is the file the error is attributed to, when known.
- `identity` is the colliding command name or prefix for `discovery-conflict`.
- `suggestion` carries a "did you mean" candidate for `usage` errors.

## Category to fix

| `category` | Cause | Fix |
| :--- | :--- | :--- |
| `module-validation` | A module is missing `execute`, `builder`, `name`, or `prefix`, or has no default export. | Open each `issues[].file` under the folder in `metadata.category` and restore the missing member. |
| `discovery-conflict` | Two modules share a command name or `customId` prefix. | Rename one of them; `identity` names the collision. Run `circe routes --format json` to see all routes. |
| `config` | The environment schema in `src/config.ts` rejected the environment. | Set each variable named by `issues[].path`. Never invent a token; ask the user. |
| `config-file` | `circe.config.ts` is missing, unloadable, or has no default export. | Ensure `export default defineCirceConfig({ ... })`. For `http` or `hybrid`, add `http: { publicKey }`. |
| `usage` | Unknown command, missing argument, or unknown `--format` value. | Use `suggestion` or run `circe --help`. |
| `operational` | Another expected failure, such as `circe add` on an existing file. | Read `message`; pass `--force` only if overwriting is intended. |
| `internal` | Unexpected defect. | Do not retry blindly. Report `name`, `message`, and `stack`. |

## Do not

- Do not delete a module to make `circe build` pass.
- Do not weaken the environment schema to silence a `config` error.
- Do not hard-code credentials. Ask the user to provide them through the environment.

