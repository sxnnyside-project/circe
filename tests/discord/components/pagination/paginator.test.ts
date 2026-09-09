import { describe, expect, test } from "bun:test";
import { MemoryPaginationStore } from "../../../../src/discord/components/pagination/memory-store.js";
import { createPaginator } from "../../../../src/discord/components/pagination/paginator.js";

function fakeReplyableInteraction() {
  const replies: unknown[] = [];
  const edits: unknown[] = [];
  return {
    replies,
    edits,
    reply: async (payload: unknown) => {
      replies.push(payload);
    },
    editReply: async (payload: unknown) => {
      edits.push(payload);
    },
  };
}

function extractCustomIds(payload: unknown): string[] {
  const components = (payload as { components: { components: { data: { custom_id: string } }[] }[] }).components;
  return components.flatMap((row) => row.components.map((button) => button.data.custom_id));
}

function isDisabled(payload: unknown, index: number): boolean {
  const components = (payload as { components: { components: { data: { disabled?: boolean } }[] }[] }).components;
  return Boolean(components[0]?.components[index]?.data.disabled);
}

async function clickButton(paginator: ReturnType<typeof createPaginator>, customId: string) {
  const updates: unknown[] = [];
  const ctx = {
    params: {
      sessionId: customId.split(":")[1] as string,
      direction: customId.split(":")[2] as string,
    },
    interaction: {
      isStringSelectMenu: () => false,
      update: async (payload: unknown) => {
        updates.push(payload);
      },
      editReply: async () => {},
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal component context stub, only the fields execute() reads
  } as any;

  await paginator.component.execute(ctx);
  return updates;
}

async function selectPage(paginator: ReturnType<typeof createPaginator>, customId: string, value: string) {
  const updates: unknown[] = [];
  const ctx = {
    params: {
      sessionId: customId.split(":")[1] as string,
      direction: customId.split(":")[2] as string,
    },
    interaction: {
      isStringSelectMenu: () => true,
      values: [value],
      update: async (payload: unknown) => {
        updates.push(payload);
      },
      editReply: async () => {},
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal component context stub, only the fields execute() reads
  } as any;

  await paginator.component.execute(ctx);
  return updates;
}

function extractSelectCustomId(payload: unknown): string | undefined {
  const components = (payload as { components: { components: { data: { custom_id: string } }[] }[] }).components;
  return components[1]?.components[0]?.data.custom_id;
}

interface SelectOption {
  label: string;
  value: string;
  default?: boolean;
}

function selectOptions(payload: unknown): SelectOption[] {
  const row = (payload as { components: { components: { toJSON(): { options: SelectOption[] } }[] }[] }).components[1];
  return row?.components[0]?.toJSON().options ?? [];
}

describe("createPaginator", () => {
  test("replies with the first page, prev disabled, next enabled", async () => {
    const paginator = createPaginator();
    const interaction = fakeReplyableInteraction();

    await paginator.reply(interaction, [{ content: "page 1" }, { content: "page 2" }]);

    expect(interaction.replies).toHaveLength(1);
    const payload = interaction.replies[0];
    expect((payload as { content: string }).content).toBe("page 1");
    expect(isDisabled(payload, 0)).toBe(true);
    expect(isDisabled(payload, 1)).toBe(false);
  });

  test("clicking next advances to the next page and re-enables prev", async () => {
    const paginator = createPaginator();
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "page 1" }, { content: "page 2" }, { content: "page 3" }]);

    const [nextCustomId] = extractCustomIds(interaction.replies[0]).slice(1);
    const updates = await clickButton(paginator, nextCustomId as string);

    expect((updates[0] as { content: string }).content).toBe("page 2");
    expect(isDisabled(updates[0], 0)).toBe(false);
    expect(isDisabled(updates[0], 1)).toBe(false);
  });

  test("next is disabled again on the last page, and clicking next there is a no-op bound at the last page", async () => {
    const paginator = createPaginator();
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "page 1" }, { content: "page 2" }]);

    const [nextId] = extractCustomIds(interaction.replies[0]).slice(1);
    const firstClick = await clickButton(paginator, nextId as string);
    expect((firstClick[0] as { content: string }).content).toBe("page 2");
    expect(isDisabled(firstClick[0], 1)).toBe(true);

    // Clicking "next" again from the last page (button should be disabled client-side, but verify server-side bound too).
    const secondClick = await clickButton(paginator, nextId as string);
    expect((secondClick[0] as { content: string }).content).toBe("page 2");
  });

  test("clicking prev from page 0 stays bound at page 0", async () => {
    const paginator = createPaginator();
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "only" }, { content: "second" }]);

    const [prevId] = extractCustomIds(interaction.replies[0]);
    const click = await clickButton(paginator, prevId as string);
    expect((click[0] as { content: string }).content).toBe("only");
  });

  test("independent sessions from the same paginator don't share state", async () => {
    const paginator = createPaginator();
    const a = fakeReplyableInteraction();
    const b = fakeReplyableInteraction();

    await paginator.reply(a, [{ content: "a1" }, { content: "a2" }]);
    await paginator.reply(b, [{ content: "b1" }, { content: "b2" }]);

    const [aNext] = extractCustomIds(a.replies[0]).slice(1);
    const clickA = await clickButton(paginator, aNext as string);
    expect((clickA[0] as { content: string }).content).toBe("a2");

    // b's session is untouched by a's click.
    expect((b.replies[0] as { content: string }).content).toBe("b1");
  });

  test("clicking a button for an expired/unknown session disables the row instead of throwing", async () => {
    const store = new MemoryPaginationStore();
    const paginator = createPaginator({ store });

    const updates: unknown[] = [];
    const ctx = {
      params: { sessionId: "does-not-exist", direction: "next" },
      interaction: { update: async (payload: unknown) => updates.push(payload) },
      // biome-ignore lint/suspicious/noExplicitAny: minimal component context stub
    } as any;

    await paginator.component.execute(ctx);
    expect(isDisabled(updates[0], 0)).toBe(true);
    expect(isDisabled(updates[0], 1)).toBe(true);

    store.dispose();
  });

  test("auto-disables the row after the idle timeout elapses, via a single scheduled edit", async () => {
    const paginator = createPaginator({ idleTimeoutMs: 20 });
    const interaction = fakeReplyableInteraction();

    await paginator.reply(interaction, [{ content: "page 1" }, { content: "page 2" }]);
    expect(interaction.edits).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(interaction.edits).toHaveLength(1);
    expect(isDisabled(interaction.edits[0], 0)).toBe(true);
    expect(isDisabled(interaction.edits[0], 1)).toBe(true);
  });

  test("a click before the timeout prevents the stale auto-disable from firing on the old timer", async () => {
    const paginator = createPaginator({ idleTimeoutMs: 40 });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "page 1" }, { content: "page 2" }]);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const [nextId] = extractCustomIds(interaction.replies[0]).slice(1);
    await clickButton(paginator, nextId as string);

    // Original 40ms timer would have fired by now (60ms total elapsed) if it
    // weren't for the session having been re-set with a fresh TTL on click —
    // the original scheduled edit checks the store and finds a live session.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(interaction.edits).toHaveLength(0);
  });

  test("pageSelect: off by default — no dropdown row is added", async () => {
    const paginator = createPaginator();
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "page 1" }, { content: "page 2" }]);

    expect((interaction.replies[0] as { components: unknown[] }).components).toHaveLength(1);
  });

  test("pageSelect: adds a dropdown with one option per page, marking the current page as default", async () => {
    const paginator = createPaginator({ pageSelect: true });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "a" }, { content: "b" }, { content: "c" }]);

    const options = selectOptions(interaction.replies[0]);
    expect(options).toEqual([
      { label: "Page 1", value: "0", default: true },
      { label: "Page 2", value: "1", default: false },
      { label: "Page 3", value: "2", default: false },
    ]);
  });

  test("pageSelect: respects a custom page label", async () => {
    const paginator = createPaginator({ pageSelect: true });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "a", label: "Overview" }, { content: "b" }]);

    const options = selectOptions(interaction.replies[0]);
    expect(options[0]?.label).toBe("Overview");
  });

  test("pageSelect: choosing an option jumps directly to that page and updates the default marker", async () => {
    const paginator = createPaginator({ pageSelect: true });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "a" }, { content: "b" }, { content: "c" }]);

    const selectCustomId = extractSelectCustomId(interaction.replies[0]) as string;
    const updates = await selectPage(paginator, selectCustomId, "2");

    expect((updates[0] as { content: string }).content).toBe("c");
    const options = selectOptions(updates[0]);
    expect(options.map((o) => o.default)).toEqual([false, false, true]);
  });

  test("pageSelect: omitted when there are more than 25 pages, even if requested", async () => {
    const paginator = createPaginator({ pageSelect: true });
    const interaction = fakeReplyableInteraction();
    const pages = Array.from({ length: 26 }, (_, i) => ({ content: `page ${i}` }));

    await paginator.reply(interaction, pages);

    expect((interaction.replies[0] as { components: unknown[] }).components).toHaveLength(1);
  });

  test("pageSelect: omitted for a single-page pager (nothing to jump to)", async () => {
    const paginator = createPaginator({ pageSelect: true });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "only page" }]);

    expect((interaction.replies[0] as { components: unknown[] }).components).toHaveLength(1);
  });

  test("pageSelect: the disabled row on expiry also disables the dropdown", async () => {
    const paginator = createPaginator({ pageSelect: true, idleTimeoutMs: 20 });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "a" }, { content: "b" }]);

    await new Promise((resolve) => setTimeout(resolve, 60));

    const edited = interaction.edits[0] as { components: { components: { data: { disabled?: boolean } }[] }[] };
    expect(edited.components).toHaveLength(2);
    expect(edited.components[1]?.components[0]?.data.disabled).toBe(true);
  });

  test("buttons: defaults to arrow emoji with no text label, no opinion forced beyond that", async () => {
    const paginator = createPaginator();
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "a" }, { content: "b" }]);

    const buttons = (
      interaction.replies[0] as { components: { components: { toJSON(): { emoji?: unknown; label?: string } }[] }[] }
    ).components[0]?.components;
    expect(buttons?.[0]?.toJSON().emoji).toMatchObject({ name: "⬅️" });
    expect(buttons?.[0]?.toJSON().label).toBeUndefined();
  });

  test("buttons: a bot can override to plain text labels instead of emoji", async () => {
    const paginator = createPaginator({ buttons: { previous: { label: "Back" }, next: { label: "Forward" } } });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "a" }, { content: "b" }]);

    const buttons = (
      interaction.replies[0] as { components: { components: { toJSON(): { emoji?: unknown; label?: string } }[] }[] }
    ).components[0]?.components;
    expect(buttons?.[0]?.toJSON().label).toBe("Back");
    expect(buttons?.[0]?.toJSON().emoji).toBeUndefined();
    expect(buttons?.[1]?.toJSON().label).toBe("Forward");
  });

  test("buttons: a bot can override just the emoji, keeping the default no-label presentation", async () => {
    const paginator = createPaginator({ buttons: { previous: { emoji: "⏪" } } });
    const interaction = fakeReplyableInteraction();
    await paginator.reply(interaction, [{ content: "a" }, { content: "b" }]);

    const buttons = (
      interaction.replies[0] as { components: { components: { toJSON(): { emoji?: unknown; label?: string } }[] }[] }
    ).components[0]?.components;
    expect(buttons?.[0]?.toJSON().emoji).toMatchObject({ name: "⏪" });
    // "next" wasn't overridden — still the default.
    expect(buttons?.[1]?.toJSON().emoji).toMatchObject({ name: "➡️" });
  });
});
