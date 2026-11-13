---
name: circe-project-conventions
description: Where files go and what they must export in a Circe bot project. Use before creating, moving, or renaming any command, event, component, modal, context menu, guard, or single-file convention.
circe-contract: 1
---

# Circe project conventions

Circe owns the process. The bot declares modules in known folders; the `circe` CLI discovers, validates, and runs them. Never write a startup script.

## Read first

Open `.circe/project.json` before exploring the source tree. It lists the transport, scan root, enabled intents, every discovered route, and which optional conventions exist. If it is missing, run `circe manifest`.

## Folder map

All paths are relative to the scan root (default `src/`, see `project.scanRoot` in the manifest).

| Folder or file | Contains | Default export |
| :--- | :--- | :--- |
| `commands/` | Top-level slash commands. Subfolders are cosmetic. | `defineCommand({ builder, execute })` |
| `command-groups/` | Nested subcommand trees; folders define the routed path. | `_group.ts`: `defineCommandGroup`; leaves: `defineSubcommand` |
| `context-menus/users/` | User context menus. | `defineUserCommand` |
| `context-menus/messages/` | Message context menus. | `defineMessageCommand` |
| `events/` | Discord.js event listeners. | `defineEvent({ name, execute })` |
| `components/` | Buttons and select menus, routed by `customId`. | `defineComponent({ prefix \| pattern, execute })` |
| `modals/` | Modal submissions, routed by `customId` prefix. | `defineModal({ prefix, execute })` |
| `guards/` | Reusable guard functions imported by other modules. | named exports |
| `middleware.ts` | Global `before` and `after` hooks (optional). | module with hooks |
| `error.ts` | Central error boundary and reply overrides (optional). | module with handlers |
| `localization.ts` | `defineLocalizationResolver` (legacy `i18n.ts` is still read). | resolver |

## Rules

1. One file, one module, one default export, produced by the matching `define*` helper from `@sxnnyside/circe`.
2. File and folder names inside the scan root are kebab-case.
3. A leading underscore marks a non-executable metadata file (`_group.ts`). Do not register it as a command.
4. Modals and components resolve by longest `customId` prefix. Two modules must not share an identical prefix or command name.
5. Never call `client.login()`, `app.start()`, or `createCirce()` in project code. `circe start` and `circe dev` do that.
6. `ctx.interaction` is the raw discord.js interaction. Do not wrap it.
7. Secrets come from the environment schema in `src/config.ts`. Never hard-code a token or public key, and never commit `.env`.

## After any change

Follow the `circe-verify-changes` skill. Do not report a task done before `circe build` passes.

