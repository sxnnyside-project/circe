# Folder Conventions

Circe discovers a bot's commands, events, and components by directory location and module shape, rather than through manual loader registration. This document specifies those conventions: folder layout, naming constraints, and routing rules.

---

## 1. Scope

Circe governs filesystem conventions within `scanRoot` (default: `./src`). Everything outside the scan root — domain logic, database models, utility scripts, infrastructure — is unconstrained. Circe's convention governs Discord interaction boundaries only; it does not dictate how business logic is structured.

---

## 2. Design Principles

1. **Location is semantic**: Where a file lives determines what it is and how it routes, without manual wiring.
2. **One file, one module, one default export**: Every command, event, or component file exports exactly one definition. This ensures a 1:1 mapping between disk locations and registered Discord entities, allowing shape validation errors to pinpoint exact files and fields.
3. **Cosmetic and semantic nesting are separated**: Folders that organize code visually (`commands/`) never share rules with folders that define routed command paths (`command-groups/`).
4. **The convention is a stable contract**: Changing folder names or resolution rules constitutes a breaking change and follows semantic versioning.

---

## 3. Reference Structure

```
<bot-root>/
├── circe.config.ts         # Declarative bot configuration
└── src/                    # scanRoot (default: ./src)
    ├── commands/           # Top-level chat input commands (/ban, /ping)
    ├── command-groups/     # Nested subcommand trees (/config roles add)
    ├── context-menus/      # Right-click context menus
    │   ├── users/          # User context menus
    │   └── messages/       # Message context menus
    ├── events/             # Discord.js event listeners (ready, guildMemberAdd)
    ├── components/         # Interactive buttons and select menus
    ├── modals/             # Modal submit handlers
    ├── guards/             # Reusable command & component guards
    ├── middleware.ts       # Global execution hooks (before / after)
    ├── error.ts            # Centralized error boundary & reply overrides
    └── i18n.ts             # Pluggable interaction translation resolver
```

> [!TIP]
> Run `circe init` (`bun x circe init` / `npx circe init`) in an empty directory to automatically scaffold the base starter structure (`circe.config.ts`, `src/config.ts`, `src/commands/ping.ts`, `.env.example`, and `.gitignore`).

---

### 3.1 `commands/` — Top-Level Slash Commands

Files in `commands/` represent top-level `ChatInputCommandInteraction` handlers (`/ban`, `/ping`).

```
commands/
├── moderation/
│   ├── ban.ts              → /ban
│   └── kick.ts             → /kick
└── ping.ts                 → /ping
```

- **Cosmetic nesting**: Subfolders under `commands/` do not affect the registered command name. They exist purely to organize code by domain.
- **Command naming**: Defaults to the kebab-case file name (`ban.ts` → `/ban`). Can be overridden explicitly in `builder.setName(...)`.

---

### 3.2 `command-groups/` — Hierarchical Subcommands

Files in `command-groups/` represent nested subcommand trees (`/config roles add`). Unlike `commands/`, directory structure here defines the routed path.

```
command-groups/
└── config/
    ├── _group.ts           → Parent command metadata (/config) & shared guards
    └── roles/
        ├── _group.ts       → Subgroup metadata (/config roles)
        ├── add.ts          → /config roles add
        └── remove.ts       → /config roles remove
```

- **Depth limit**: Up to two levels of nesting below the root group name (group → subgroup → command), matching Discord's architectural limit.
- **`_group.ts` metadata**: Declares parent name, description, and shared group guards. The `_` prefix excludes the file from being registered as an independent executable leaf command.
- **Guard inheritance**: Group guards execute before child subcommand guards.

---

### 3.3 `context-menus/` — User & Message Commands

Right-click interaction handlers split by target type:

```
context-menus/
├── users/
│   └── report-user.ts      → User Context Menu ("Report User")
└── messages/
    └── bookmark.ts         → Message Context Menu ("Bookmark")
```

The subdirectory (`users/` or `messages/`) dictates the Discord application command type and types the target context (`ctx.target` as `GuildMember | User` or `Message`).

---

### 3.4 `events/` — Discord.js Event Listeners

Subfolders correspond to Discord.js event names (in kebab-case). Each file inside acts as an independent listener:

```
events/
├── guild-member-add/
│   ├── welcome-dm.ts
│   └── audit-log.ts
└── ready/
    └── log-status.ts
```

Multiple listeners for the same event run concurrently and isolate exceptions from each other.

---

### 3.5 `components/` — Buttons & Select Menus

Component handlers match incoming `customId` values via prefix or typed route pattern:

```
components/
├── tickets/
│   └── close.ts            → Pattern: "ticket:close:[ticketId]:[action]"
└── pagination/
    └── nav.ts              → Prefix: "page:"
```

- **Pattern matching**: Route strings like `pattern: "ticket:close:[ticketId]:[action]"` compile down to prefix matching with extracted, typed route parameters on `ctx.params`.
- **Prefix matching**: Longest-prefix match resolves the destination handler deterministically.

---

### 3.6 `modals/` — Modal Submit Handlers

Modal handlers match `customId` values exactly:

```
modals/
└── feedback-form.ts        → customId: "feedback-modal"
```

---

### 3.7 `middleware.ts`, `error.ts`, and `i18n.ts`

Optional single-file conventions discovered at the scan root:

- **`middleware.ts`**: Exports global `before` and `after` hooks wrapping command and interaction execution.
- **`error.ts`**: Exports centralized error formatting and fallback replies when commands fail.
- **`i18n.ts`**: Exports an `I18nResolver` implementation providing translations for `ctx.t(key, params)` based on `interaction.locale`.

---

## 4. Naming Rules

- **kebab-case is required** for all files and directories inside `scanRoot`.
- **One file, one default export** using Circe identity helpers (`defineCommand`, `defineEvent`, etc.).
- **Leading underscore (`_`)** is reserved for non-executable metadata files (e.g., `_group.ts`).
- **File name determines default identifier** unless explicitly overridden in the module builder.

---

## 5. Scan Root Configuration

To specify an alternate scan root, set `scanRoot` in `circe.config.ts`:

```ts
import { defineCirceConfig, defineConfig } from "@sxnnyside/circe";
import { GatewayIntentBits } from "discord.js";
import { z } from "zod";

export default defineCirceConfig({
  config: defineConfig(z.object({ token: z.string() })),
  intents: [GatewayIntentBits.Guilds],
  scanRoot: "./src", // default
});
```

---

## 6. Pre-flight Validation

During scanning (`circe dev`, `circe start`, `circe build`), all discovered files are validated against their category contracts before registration. Violations are reported with exact file paths and missing fields:

```
✗ src/commands/moderation/ban.ts
  Does not export a valid CommandDefinition: missing `builder`.
  Scanned as a command because it is located under `commands/`.
```

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

