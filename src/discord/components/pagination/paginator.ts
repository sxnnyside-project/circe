import {
  type APIEmbed,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import { invokerOnly } from '../../guards/invoker-only.js';
import type { ComponentDefinition } from '../types.js';
import { defineComponent } from '../types.js';
import { MemoryPaginationStore } from './memory-store.js';
import type { PaginationStore, PaginatorPage, SerializedPaginatorPage } from './types.js';

const MAX_SELECT_OPTIONS = 25;

/**
 * Configuration options for creating a paginated embed carousel.
 *
 * @public
 */
export interface CreatePaginatorOptions {
  /**
   * Identifies this paginator's buttons among others registered in the same bot.
   * @defaultValue `"circe-paginate"`
   */
  readonly id?: string;
  /**
   * How long a session stays alive without interaction before its buttons are disabled.
   * @defaultValue `300000` (5 minutes)
   */
  readonly idleTimeoutMs?: number;
  /**
   * Custom session storage provider.
   * @defaultValue {@link MemoryPaginationStore}
   */
  readonly store?: PaginationStore;
  /**
   * Adds a page-select dropdown below the prev/next row, letting the user jump directly to a page.
   * Silently omitted if pages exceed 25.
   * @defaultValue `false`
   */
  readonly pageSelect?: boolean;
  /**
   * Restricts button clicks to the user who ran the command producing the pager.
   * @defaultValue `false`
   */
  readonly invokerOnly?: boolean;
  /**
   * Overrides the prev/next button presentation (emoji and text label).
   */
  readonly buttons?: {
    readonly previous?: { readonly emoji?: string; readonly label?: string };
    readonly next?: { readonly emoji?: string; readonly label?: string };
  };
}

const DEFAULT_PREVIOUS_EMOJI = '⬅️';
const DEFAULT_NEXT_EMOJI = '➡️';

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
  return {
    emoji: override.emoji ?? defaultEmoji,
    ...(override.label !== undefined ? { label: override.label } : {}),
  };
}

type PaginatorRow = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

interface EditableMessage {
  editReply(options: { components: PaginatorRow[] }): Promise<unknown>;
}

interface ReplyableMessage {
  reply(options: {
    content?: string;
    embeds?: unknown[];
    components: PaginatorRow[];
  }): Promise<unknown>;
}

/**
 * Paginator controller instance managing interaction routing and initial page delivery.
 *
 * @public
 */
export interface Paginator {
  /** Register this once under `components/` — handles every session this paginator creates. */
  readonly component: ComponentDefinition<Record<string, never>, Record<string, string>>;
  /**
   * Replies to `interaction` with the first page and wires up the prev/next buttons.
   *
   * @param interaction - Repliable Discord interaction.
   * @param pages - Sequence of one or more pages to cycle through.
   */
  reply(
    interaction: ReplyableMessage & EditableMessage,
    pages: readonly PaginatorPage[],
  ): Promise<void>;
}

const DEFAULT_ID = 'circe-paginate';
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
      new ButtonBuilder()
        .setCustomId(`${prefix}:${sessionId}:prev`)
        .setStyle(ButtonStyle.Secondary),
      previous,
    ).setDisabled(index <= 0),
    applyPresentation(
      new ButtonBuilder()
        .setCustomId(`${prefix}:${sessionId}:next`)
        .setStyle(ButtonStyle.Secondary),
      next,
    ).setDisabled(index >= pageCount - 1),
  );
}

function buildSelectRow(
  prefix: string,
  sessionId: string,
  index: number,
  pages: readonly SerializedPaginatorPage[],
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
  pages: readonly SerializedPaginatorPage[],
  pageSelect: boolean,
  previous: ButtonPresentation,
  next: ButtonPresentation,
): PaginatorRow[] {
  const rows: PaginatorRow[] = [
    buildButtonRow(prefix, sessionId, index, pages.length, previous, next),
  ];
  if (pageSelect) {
    const selectRow = buildSelectRow(prefix, sessionId, index, pages);
    if (selectRow) {
      rows.push(selectRow);
    }
  }
  return rows;
}

function serializePage(page: PaginatorPage): SerializedPaginatorPage {
  return {
    ...(page.content !== undefined ? { content: page.content } : {}),
    ...(page.embeds !== undefined
      ? { embeds: page.embeds.map((embed) => ('toJSON' in embed ? embed.toJSON() : embed)) }
      : {}),
    ...(page.label !== undefined ? { label: page.label } : {}),
  };
}

function pagePayload(
  page: SerializedPaginatorPage | undefined,
  components: PaginatorRow[],
): { content?: string; embeds: APIEmbed[]; components: PaginatorRow[] } {
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
          .setPlaceholder('This pager has expired.')
          .setDisabled(true)
          .addOptions({ label: 'expired', value: 'expired' }),
      ),
    );
  }
  return rows;
}

/**
 * Creates a paginated embed/text carousel: prev/next buttons (and,
 * optionally, a page-select dropdown for jumping directly to a page).
 *
 * @remarks
 * No message collectors are held open. State lives in a {@link PaginationStore} keyed
 * by random session ID. Idle sessions auto-disable components via a single scheduled edit.
 *
 * @param options - Paginator configuration options.
 * @returns A {@link Paginator} controller instance.
 *
 * @example
 * ```typescript
 * import { createPaginator } from '@sxnnyside/circe';
 *
 * export const paginator = createPaginator({ invokerOnly: true });
 *
 * // In a command:
 * await paginator.reply(ctx.interaction, [
 *   { embeds: [embedPage1] },
 *   { embeds: [embedPage2] },
 * ]);
 * ```
 *
 * @public
 */
export function createPaginator(options: CreatePaginatorOptions = {}): Paginator {
  const prefix = options.id ?? DEFAULT_ID;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const store = options.store ?? new MemoryPaginationStore();
  const pageSelect = options.pageSelect ?? false;
  const guards = options.invokerOnly ? [invokerOnly()] : [];
  const previousPresentation = resolveButtonPresentation(
    options.buttons?.previous,
    DEFAULT_PREVIOUS_EMOJI,
  );
  const nextPresentation = resolveButtonPresentation(options.buttons?.next, DEFAULT_NEXT_EMOJI);
  // One outstanding disable timer per session in this process; every interaction here reschedules it.
  // The timer is only a prompt to look: whether the session is idle is decided by `idleUntil` in the
  // store, so a click handled by another process (which extends the session) is never undone by this one.
  const disableTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function scheduleAutoDisable(
    interaction: EditableMessage,
    sessionId: string,
    delayMs = idleTimeoutMs,
  ): void {
    const existing = disableTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      disableTimers.delete(sessionId);
      void (async () => {
        const session = await store.get(sessionId);
        if (session && session.idleUntil > Date.now()) {
          scheduleAutoDisable(interaction, sessionId, session.idleUntil - Date.now());
          return;
        }
        await store.delete(sessionId);
        await interaction.editReply({
          components: disabledComponents(
            prefix,
            pageSelect,
            previousPresentation,
            nextPresentation,
          ),
        });
      })().catch(() => {
        // The store may be unreachable, the message gone, or the interaction token expired; a click
        // on a stale pager is answered with disabled components anyway.
      });
    }, delayMs);
    timer.unref?.();
    disableTimers.set(sessionId, timer);
  }

  const component = defineComponent({
    pattern: `${prefix}:[sessionId]:[direction]`,
    guards,
    async execute(ctx) {
      const { sessionId, direction } = ctx.params;
      const session = await store.get(sessionId);

      if (!session) {
        await ctx.interaction.update({
          components: disabledComponents(
            prefix,
            pageSelect,
            previousPresentation,
            nextPresentation,
          ),
        });
        return;
      }

      let nextIndex: number;
      if (direction === 'select' && ctx.interaction.isStringSelectMenu()) {
        const requested = Number.parseInt(ctx.interaction.values[0] ?? '0', 10);
        nextIndex = Number.isNaN(requested)
          ? session.index
          : Math.min(Math.max(requested, 0), session.pages.length - 1);
      } else if (direction === 'next') {
        nextIndex = Math.min(session.index + 1, session.pages.length - 1);
      } else {
        nextIndex = Math.max(session.index - 1, 0);
      }

      await store.set(
        sessionId,
        { pages: session.pages, index: nextIndex, idleUntil: Date.now() + idleTimeoutMs },
        idleTimeoutMs,
      );
      const page = session.pages[nextIndex];

      // Discord keeps fields an update omits, so the empty `content` clears text left by a previous page.
      await ctx.interaction.update({
        content: '',
        ...pagePayload(
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
      });

      scheduleAutoDisable(ctx.interaction, sessionId);
    },
  });

  return {
    component,
    async reply(interaction, pages) {
      if (pages.length === 0) {
        throw new RangeError('createPaginator().reply() requires at least one page');
      }
      const sessionId = crypto.randomUUID();
      const stored = pages.map(serializePage);
      await store.set(
        sessionId,
        { pages: stored, index: 0, idleUntil: Date.now() + idleTimeoutMs },
        idleTimeoutMs,
      );

      const page = stored[0];
      await interaction.reply(
        pagePayload(
          page,
          buildComponents(
            prefix,
            sessionId,
            0,
            stored,
            pageSelect,
            previousPresentation,
            nextPresentation,
          ),
        ),
      );

      scheduleAutoDisable(interaction, sessionId);
    },
  };
}
