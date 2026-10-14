# Module Contracts

Every file discovered under a [folder convention](folder-conventions.md) is validated against a strict shape before registration. This document specifies those contracts for each module category.

---

## 1. Shared Invariants

Every registrable module exports a single `default` value produced by an identity helper (`defineCommand`, `defineEvent`, `defineComponent`, etc.). The helpers exist solely for TypeScript type inference — they return their arguments unmodified at runtime.

Two architectural guarantees apply across all module types:

- **The raw discord.js interaction is never hidden**: Context objects (`CommandContext`, `ComponentContext`, etc.) expose the underlying `interaction` directly. Circe adds correlation IDs, logging, guards, and i18n without wrapping Discord API primitives.
- **A bot-owned `metadata` bag is never inspected by Circe**: Definitions accept an optional `metadata` object where project-specific data (permissions, feature flags, analytics tags) can be attached safely.

---

## 2. Commands (`commands/`)

```ts
interface CommandDefinition<Metadata = Record<string, never>> {
  readonly builder: CommandBuilder;
  readonly guards?: readonly Guard[];
  readonly autocomplete?: AutocompleteHandler;
  readonly metadata?: Metadata;
  execute(ctx: CommandContext): void | Promise<void>;
}
```

- `builder`: Required `SlashCommandBuilder` (or equivalent builder from `discord.js`).
- `guards`: Optional array of `Guard` functions running before `execute`. The first denial short-circuits execution.
- `autocomplete`: Optional handler called when Discord dispatches autocomplete requests for this command. Its context carries `interaction`, `client`, `guild`, `logger`, `correlationId` and `t` (for localizing choice names).
- `execute`: Required execution function receiving `CommandContext`.

`CommandContext` provides:
- `interaction`: The raw `ChatInputCommandInteraction`.
- `client`: The Discord.js `Client`.
- `guild`: Cached `Guild` (or `null`).
- `member`: Cached `GuildMember` (or `null`).
- `user`: The interacting `User`.
- `logger`: Scoped structured logger.
- `correlationId`: Unique tracing ID.
- `t(key, params)`: Locale-aware translation helper resolved against `interaction.locale`.

---

## 3. Command Groups & Subcommands (`command-groups/`)

Parent group metadata is defined in `_group.ts`:

```ts
interface CommandGroupDefinition<Metadata = Record<string, never>> {
  readonly name: string;
  readonly description: string;
  readonly guards?: readonly Guard[];
  readonly metadata?: Metadata;
}
```

Leaf subcommands are defined in standard `.ts` files inside the group directory using `defineSubcommand`:

```ts
import type { SlashCommandSubcommandBuilder } from "discord.js";

interface SubcommandDefinition<Metadata = Record<string, never>> {
  readonly builder: SlashCommandSubcommandBuilder;
  readonly guards?: readonly Guard[];
  readonly metadata?: Metadata;
  execute(ctx: CommandContext): void | Promise<void>;
}
```

- `builder`: Required `SlashCommandSubcommandBuilder` from `discord.js` configuring subcommand name, description, and options.
- `guards`: Optional array of guards evaluated after parent `_group.ts` guards pass.

---

## 4. Context Menu Commands (`context-menus/`)

Right-click commands on users or messages are split into dedicated definitions:

### User Context Menu (`context-menus/users/`)

```ts
interface UserCommandDefinition<Metadata = Record<string, never>> extends ContextMenuRegistrationOptions {
  readonly name: string;
  readonly guards?: readonly UserCommandGuard[];
  readonly metadata?: Metadata;
  execute(ctx: UserContextMenuCommandContext): void | Promise<void>;
}
```

- `ctx.target`: The target `GuildMember | User`.

### Message Context Menu (`context-menus/messages/`)

```ts
interface MessageCommandDefinition<Metadata = Record<string, never>> extends ContextMenuRegistrationOptions {
  readonly name: string;
  readonly guards?: readonly MessageCommandGuard[];
  readonly metadata?: Metadata;
  execute(ctx: MessageContextMenuCommandContext): void | Promise<void>;
}
```

- `ctx.target`: The target `Message`.

### Registration options

Context menus have no `builder`, so the properties Discord enforces itself (before the entry is even shown) are declared on the definition and applied when Circe registers the command:

```ts
interface ContextMenuRegistrationOptions {
  readonly defaultMemberPermissions?: PermissionResolvable | null; // 0n = administrators only
  readonly contexts?: readonly InteractionContextType[];
  readonly integrationTypes?: readonly ApplicationIntegrationType[];
  readonly nameLocalizations?: LocalizationMap;
}
```

Client-side hiding is a UX layer, not authorization: keep a guard (`hasPermission(...)`) as defense in depth.

---

## 5. Events (`events/`)

Event listeners for Discord.js client events:

```ts
interface EventDefinition<EventName extends keyof ClientEvents> {
  readonly name: EventName;
  readonly once?: boolean;
  execute(...args: ClientEvents[EventName]): void | Promise<void>;
}
```

- `name`: Valid key of `ClientEvents` matching the parent directory name.
- `once`: When `true`, registers via `client.once` instead of `client.on`.

---

## 6. Components (`components/`)

Component definitions are authoring-time discriminated unions via **two mutually exclusive overloads** of `defineComponent()`:

### Option A: Prefix-Based Components

Routes by longest-prefix match on `customId`, with optional structured parameter extraction:

```ts
interface ComponentDefinition<Metadata = Record<string, never>, Params = undefined> {
  readonly prefix: string;
  readonly guards?: readonly ComponentGuard<Params>[]; // run after parse, before execute
  readonly metadata?: Metadata;
  parse?(customId: string): Params;
  execute(ctx: ComponentContext<ComponentInteraction, Params>): void | Promise<void>;
}
```

### Option B: Pattern-Based Components

Routes by URL-style path patterns with compile-time type inference:

```ts
interface PatternComponentDefinition<Pattern extends string, Metadata = Record<string, never>> {
  readonly pattern: Pattern;
  readonly guards?: readonly ComponentGuard<ParamsFromPattern<Pattern>>[];
  readonly metadata?: Metadata;
  execute(ctx: ComponentContext<ComponentInteraction, ParamsFromPattern<Pattern>>): void | Promise<void>;
}
```

Example of a pattern-based component:

```ts
import { defineComponent } from "@sxnnyside/circe";

export default defineComponent({
  pattern: "ticket:close:[ticketId]:[action]",
  async execute(ctx) {
    // ctx.params is automatically typed as { ticketId: string; action: string }
    const { ticketId, action } = ctx.params;
    await ctx.interaction.reply(`Ticket #${ticketId} action: ${action}`);
  },
});
```

> [!IMPORTANT]
> `prefix` and `pattern` are mutually exclusive overloads in `defineComponent()`. They cannot be combined in the same object.

### Component Pagination (`createPaginator`)

Circe provides an allocation-safe pagination helper `createPaginator()` that routes button and menu interactions through standard component registration rather than keeping memory-leaking interaction collectors open in memory.

```ts
import { createPaginator, MemoryPaginationStore } from "@sxnnyside/circe";

export const paginator = createPaginator({
  id: "search-results",               // Prefix identifier for buttons (default: "circe-paginate")
  idleTimeoutMs: 5 * 60_000,          // Session lifetime before buttons disable (default: 5 min)
  store: new MemoryPaginationStore(), // Backing store for active pagination sessions
  pageSelect: true,                   // Adds a dropdown select menu to jump directly to any page
  buttons: {                          // Optional overrides for button presentation
    previous: { label: "Previous", emoji: "◀️" },
    next: { label: "Next", emoji: "▶️" },
  },
});
```

#### Registering the Paginator Component

Export the paginator's component definition anywhere inside `components/` so Circe dispatches button and select menu interactions to it:

```ts
// src/components/search-paginator.ts
import { paginator } from "../lib/paginator.js";

export default paginator.component;
```

#### Sending a Paginated Reply

Call `paginator.reply()` inside any command or interaction handler:

```ts
// src/commands/search.ts
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { defineCommand } from "@sxnnyside/circe";
import { paginator } from "../lib/paginator.js";

export default defineCommand({
  builder: new SlashCommandBuilder().setName("search").setDescription("Search items"),
  async execute(ctx) {
    const pages = [
      {
        content: "Page 1 of results",
        embeds: [new EmbedBuilder().setTitle("First Page")],
        label: "First Page", // Label for pageSelect dropdown option
      },
      {
        content: "Page 2 of results",
        embeds: [new EmbedBuilder().setTitle("Second Page")],
        label: "Second Page",
      },
    ];

    await paginator.reply(ctx.interaction, pages);
  },
});
```

> [!NOTE]
> When `pageSelect: true` is enabled, an interactive `StringSelectMenuBuilder` dropdown appears below the previous/next buttons. If total pages exceed 25 (Discord's maximum select options limit) or equal 1, the dropdown is gracefully omitted without breaking the response.

---

## 7. Modals (`modals/`)

Modal submit handlers resolve via longest-prefix matching on `customId` (same routing model as prefix components):

```ts
interface ModalDefinition<Metadata = Record<string, never>> {
  readonly prefix: string;
  readonly guards?: readonly ModalGuard[];
  readonly metadata?: Metadata;
  execute(ctx: ModalContext): void | Promise<void>;
}
```

Values submitted by the user are read directly from `ctx.interaction.fields`.

---

## 8. Guards & Rate Limiting

Guards are reusable preconditions that validate interactions before `execute`:

```ts
type GuardResult = true | string;
type Guard = (ctx: CommandContext) => GuardResult | Promise<GuardResult>;
```

Returning `true` permits execution; returning a `string` blocks execution with that reason.

Commands, subcommands, context menus, components and modals all accept `guards`. The built-in `guildOnly()`, `hasPermission()` and `cooldown()` read only the slice of the context they need (`guild`, `member`, `user`, `interaction.commandName`), so one guard instance is usable on every interaction kind that carries it. Denials are presented by `onGuardDenied` (commands), `onContextMenuGuardDenied`, `onComponentGuardDenied` and `onModalGuardDenied`; each defaults to an ephemeral reply with the reason.

### Built-in Invoker Guard

`invokerOnly()` restricts a component to the user who triggered the interaction that produced its message. Pass `resolveOwnerId` when the owner is encoded elsewhere (e.g. in the `customId`); an owner that cannot be established is denied.

### Built-in Cooldown Guard

Circe provides a composable `cooldown()` guard:

```ts
import { cooldown, MemoryCooldownStore } from "@sxnnyside/circe";

export const commandCooldown = cooldown({
  durationMs: 5000,
  scope: "user", // "user" | "guild" | "channel"
  store: new MemoryCooldownStore(),
});
```

---

## 9. Error Diagnostics

Any discovered module violating these contracts is excluded from registration and reported during scan time:

```
✗ src/commands/moderation/ban.ts
  Does not export a valid CommandDefinition: missing `builder`.
  Scanned as a command because it is located under `commands/`.
```

---

*Circe is a Sxnnyside Project. Part of the [Sxnnyside Project](https://sxnnysideproject.com).*

