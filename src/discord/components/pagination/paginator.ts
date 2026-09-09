import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ComponentDefinition } from "../types.js";
import { defineComponent } from "../types.js";
import { MemoryPaginationStore } from "./memory-store.js";
import type { PaginationStore, PaginatorPage } from "./types.js";

const MAX_SELECT_OPTIONS = 25;

export interface CreatePaginatorOptions {
  /** Identifies this paginator's buttons among others registered in the same bot. Defaults to `"circe-paginate"`. */
  readonly id?: string;
  /** How long a session stays alive with no interaction before its buttons are disabled. Defaults to 5 minutes. Refreshed on every click. */
  readonly idleTimeoutMs?: number;
  readonly store?: PaginationStore;
  /**
   * Adds a page-select dropdown below the prev/next row, letting the user
   * jump straight to any page instead of clicking through sequentially.
   * Silently omitted for a session with more than 25 pages — Discord
   * select menus cannot hold more options than that, and forcing it would
   * make the outgoing payload invalid instead of degrading gracefully.
   */
  readonly pageSelect?: boolean;
  /**
   * Overrides the prev/next button presentation. Circe never hardcodes a
   * presentation choice without an escape hatch — the default (⬅️/➡️
   * emoji, no text label) is a sensible starting point, not a fixed
   * opinion. Supplying `label` without `emoji` drops the default emoji
   * rather than combining it with your label unexpectedly.
   */
  readonly buttons?: {
    readonly previous?: { readonly emoji?: string; readonly label?: string };
    readonly next?: { readonly emoji?: string; readonly label?: string };
  };
}

const DEFAULT_PREVIOUS_EMOJI = "⬅️";
const DEFAULT_NEXT_EMOJI = "➡️";

interface ButtonPresentation {
  readonly emoji?: string;
  readonly label?: string;
}

function resolveButtonPresentation(
  override: { readonly emoji?: string; readonly label?: string } | undefined,
  defaultEmoji: string,
): ButtonPresentation {
  if (!override) {
    return { emoji: defaultEmoji };
  }
  if (override.emoji === undefined && override.label !== undefined) {
    return { label: override.label };
  }
  return { emoji: override.emoji ?? defaultEmoji, ...(override.label !== undefined ? { label: override.label } : {}) };
}

type PaginatorRow = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

interface EditableMessage {
  editReply(options: { components: PaginatorRow[] }): Promise<unknown>;
}

interface ReplyableMessage {
  reply(options: { content?: string; embeds?: unknown[]; components: PaginatorRow[] }): Promise<unknown>;
}

export interface Paginator {
  /** Register this once, anywhere under `components/` — it handles every session this paginator ever creates. */
  readonly component: ComponentDefinition<Record<string, never>, Record<string, string>>;
  /**
   * Replies to `interaction` with the first page and wires up the
   * prev/next buttons (and, if enabled, the page-select dropdown). No
   * collector involved: clicks route through the ordinary component
   * registry like any other button, and the session auto-expires
   * (components disabled in place) via one scheduled edit, not a
   * listener held open for the pager's lifetime.
   */
  reply(interaction: ReplyableMessage & EditableMessage, pages: readonly PaginatorPage[]): Promise<void>;
}

const DEFAULT_ID = "circe-paginate";
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;

function applyPresentation(button: ButtonBuilder, presentation: ButtonPresentation): ButtonBuilder {
  if (presentation.emoji !== undefined) {
    button.setEmoji(presentation.emoji);
  }
  if (presentation.label !== undefined) {
    button.setLabel(presentation.label);
  }
  return button;
}

function buildButtonRow(
  prefix: string,
  sessionId: string,
  index: number,
  pageCount: number,
  previous: ButtonPresentation,
  next: ButtonPresentation,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    applyPresentation(
      new ButtonBuilder().setCustomId(`${prefix}:${sessionId}:prev`).setStyle(ButtonStyle.Secondary),
      previous,
    ).setDisabled(index <= 0),
    applyPresentation(
      new ButtonBuilder().setCustomId(`${prefix}:${sessionId}:next`).setStyle(ButtonStyle.Secondary),
      next,
    ).setDisabled(index >= pageCount - 1),
  );
}

function buildSelectRow(
  prefix: string,
  sessionId: string,
  index: number,
  pages: readonly PaginatorPage[],
): ActionRowBuilder<StringSelectMenuBuilder> | undefined {
  if (pages.length <= 1 || pages.length > MAX_SELECT_OPTIONS) {
    return undefined;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${prefix}:${sessionId}:select`)
    .setPlaceholder(`Page ${index + 1} of ${pages.length}`)
    .addOptions(
      pages.map((page, i) => ({
        label: page.label ?? `Page ${i + 1}`,
        value: String(i),
        default: i === index,
      })),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildComponents(
  prefix: string,
  sessionId: string,
  index: number,
  pages: readonly PaginatorPage[],
  pageSelect: boolean,
  previous: ButtonPresentation,
  next: ButtonPresentation,
): PaginatorRow[] {
  const rows: PaginatorRow[] = [buildButtonRow(prefix, sessionId, index, pages.length, previous, next)];
  if (pageSelect) {
    const selectRow = buildSelectRow(prefix, sessionId, index, pages);
    if (selectRow) {
      rows.push(selectRow);
    }
  }
  return rows;
}

function pagePayload(
  page: PaginatorPage | undefined,
  components: PaginatorRow[],
): { content?: string; embeds: EmbedBuilder[]; components: PaginatorRow[] } {
  return {
    ...(page?.content !== undefined ? { content: page.content } : {}),
    embeds: page?.embeds ?? [],
    components,
  };
}

function disabledComponents(
  prefix: string,
  pageSelect: boolean,
  previous: ButtonPresentation,
  next: ButtonPresentation,
): PaginatorRow[] {
  const rows: PaginatorRow[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      applyPresentation(
        new ButtonBuilder().setCustomId(`${prefix}:expired:prev`).setStyle(ButtonStyle.Secondary),
        previous,
      ).setDisabled(true),
      applyPresentation(
        new ButtonBuilder().setCustomId(`${prefix}:expired:next`).setStyle(ButtonStyle.Secondary),
        next,
      ).setDisabled(true),
    ),
  ];
  if (pageSelect) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${prefix}:expired:select`)
          .setPlaceholder("This pager has expired.")
          .setDisabled(true)
          .addOptions({ label: "expired", value: "expired" }),
      ),
    );
  }
  return rows;
}

/**
 * Creates a paginated embed/text carousel: prev/next buttons (and,
 * optionally, a page-select dropdown for jumping directly to a page) that
 * page through `pages` without ever registering a per-message collector.
 * State lives in a `PaginationStore` keyed by a random session id embedded
 * in each component's `customId` (built on the `pattern` matching from
 * 3.1); idle sessions are disabled via a single scheduled edit per
 * session, refreshed on every interaction — never a listener held open
 * indefinitely.
 */
export function createPaginator(options: CreatePaginatorOptions = {}): Paginator {
  const prefix = options.id ?? DEFAULT_ID;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const store = options.store ?? new MemoryPaginationStore();
  const pageSelect = options.pageSelect ?? false;
  const previousPresentation = resolveButtonPresentation(options.buttons?.previous, DEFAULT_PREVIOUS_EMOJI);
  const nextPresentation = resolveButtonPresentation(options.buttons?.next, DEFAULT_NEXT_EMOJI);
  // One outstanding disable timer per session — every interaction
  // reschedules it, so it must cancel the previous one first. Without
  // this, an interaction right before an old timer fires would leave that
  // stale timer running and it would disable an otherwise-still-active
  // session: the timer itself *is* the expiry signal, not a re-check
  // against the store's own TTL (checking `store.get()` here would race
  // against it, since both use the same duration and the timer fires at
  // or after the exact moment the store already considers the entry
  // expired).
  const disableTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function scheduleAutoDisable(interaction: EditableMessage, sessionId: string): void {
    const existing = disableTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      disableTimers.delete(sessionId);
      store.delete(sessionId);
      void interaction
        .editReply({ components: disabledComponents(prefix, pageSelect, previousPresentation, nextPresentation) })
        .catch(() => {
          // The message may already be gone, or the interaction token may have expired — nothing more to do.
        });
    }, idleTimeoutMs);
    timer.unref?.();
    disableTimers.set(sessionId, timer);
  }

  const component = defineComponent({
    pattern: `${prefix}:[sessionId]:[direction]`,
    async execute(ctx) {
      const { sessionId, direction } = ctx.params;
      const session = store.get(sessionId);

      if (!session) {
        await ctx.interaction.update({
          components: disabledComponents(prefix, pageSelect, previousPresentation, nextPresentation),
        });
        return;
      }

      let nextIndex: number;
      if (direction === "select" && ctx.interaction.isStringSelectMenu()) {
        const requested = Number.parseInt(ctx.interaction.values[0] ?? "0", 10);
        nextIndex = Number.isNaN(requested)
          ? session.index
          : Math.min(Math.max(requested, 0), session.pages.length - 1);
      } else if (direction === "next") {
        nextIndex = Math.min(session.index + 1, session.pages.length - 1);
      } else {
        nextIndex = Math.max(session.index - 1, 0);
      }

      store.set(sessionId, { pages: session.pages, index: nextIndex }, idleTimeoutMs);
      const page = session.pages[nextIndex];

      await ctx.interaction.update(
        pagePayload(
          page,
          buildComponents(
            prefix,
            sessionId,
            nextIndex,
            session.pages,
            pageSelect,
            previousPresentation,
            nextPresentation,
          ),
        ),
      );

      scheduleAutoDisable(ctx.interaction, sessionId);
    },
  });

  return {
    component,
    async reply(interaction, pages) {
      const sessionId = crypto.randomUUID();
      store.set(sessionId, { pages, index: 0 }, idleTimeoutMs);

      const page = pages[0];
      await interaction.reply(
        pagePayload(
          page,
          buildComponents(prefix, sessionId, 0, pages, pageSelect, previousPresentation, nextPresentation),
        ),
      );

      scheduleAutoDisable(interaction, sessionId);
    },
  };
}
