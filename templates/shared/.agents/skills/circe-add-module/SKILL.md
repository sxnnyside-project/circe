---
name: circe-add-module
description: Create a new command, event, component, modal, or guard with the circe add generator instead of writing boilerplate by hand. Use whenever the task adds one of those module kinds.
circe-contract: 1
---

# Add a module with `circe add`

Generate the file, then edit its body. Hand-written boilerplate drifts from the contracts that `circe build` enforces.

## Procedure

1. Choose the kind and a kebab-case name.
2. Run the generator with structured output:

   ```bash
   circe add <kind> <name> [options] --format json
   ```

3. Read `relativePath` from the JSON result and edit that file. Implement `execute`; keep the generated `define*` wrapper and default export.
4. Run the `circe-verify-changes` skill.

## Kinds and options

| Kind | Writes to | Options |
| :--- | :--- | :--- |
| `command` | `src/commands/<name>.ts` | `--description <text>`, `--guild-only` |
| `event` | `src/events/<name>.ts` | `--once` |
| `component` | `src/components/<name>.ts` | `--prefix <pfx>` or `--pattern <pat>` |
| `modal` | `src/modals/<name>.ts` | `--prefix <pfx>` |
| `guard` | `src/guards/<name>.ts` | none |

Pass `--force` only when replacing a file you intend to overwrite. Without it the generator refuses to touch an existing file.

## Examples

```bash
circe add command ban --description "Ban a member" --guild-only --format json
circe add event ready --once --format json
circe add component confirm --pattern "confirm:[action]:[userId]" --format json
circe add modal feedback --format json
circe add guard admin --format json
```

A `--pattern` component receives typed `ctx.params`; a `--prefix` component matches by longest prefix.

## Failure handling

The generator exits `2` for a malformed invocation (unknown kind, missing name) and `1` when the target already exists. Both print a structured error on stdout under `--format json`; follow the `circe-diagnose-errors` skill.

