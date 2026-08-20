import { describe, expect, test } from "bun:test";
import { ModalError } from "../../../src/discord/modals/errors.js";
import { ModalRegistry } from "../../../src/discord/modals/registry.js";
import type { ModalDefinition } from "../../../src/discord/modals/types.js";
import { defineModal } from "../../../src/discord/modals/types.js";

function makeModal(prefix: string): ModalDefinition {
  return { prefix, execute: async () => {} };
}

describe("ModalRegistry", () => {
  test("registers and resolves a handler by exact-matching prefix", () => {
    const registry = new ModalRegistry();
    const handler = makeModal("curate:submit:");

    registry.register(handler);

    expect(registry.resolve("curate:submit:123")).toBe(handler);
    expect(registry.has("curate:submit:")).toBe(true);
    expect(registry.size).toBe(1);
  });

  test("returns undefined for a customId with no matching prefix", () => {
    const registry = new ModalRegistry();
    registry.register(makeModal("curate:submit:"));

    expect(registry.resolve("profile:view:1")).toBeUndefined();
  });

  test("throws ModalError on an exact duplicate prefix", () => {
    const registry = new ModalRegistry();
    registry.register(makeModal("curate:submit:"));

    expect(() => registry.register(makeModal("curate:submit:"))).toThrow(ModalError);
  });

  test("throws ModalError when the prefix is empty", () => {
    const registry = new ModalRegistry();
    expect(() => registry.register(makeModal(""))).toThrow(ModalError);
  });

  test("resolves the longest (most specific) matching prefix, regardless of registration order", () => {
    const registry = new ModalRegistry();
    const general = makeModal("curate:");
    const specific = makeModal("curate:submit:");

    registry.register(general);
    registry.register(specific);

    expect(registry.resolve("curate:submit:123")).toBe(specific);
    expect(registry.resolve("curate:edit:123")).toBe(general);
  });

  test("exposes all registered handlers", () => {
    const registry = new ModalRegistry();
    registry.register(makeModal("a:"));
    registry.register(makeModal("b:"));

    expect(registry.all.map((m) => m.prefix).sort()).toEqual(["a:", "b:"]);
  });

  test("two independent registries never share state", () => {
    const a = new ModalRegistry();
    const b = new ModalRegistry();
    a.register(makeModal("only-in-a:"));

    expect(a.size).toBe(1);
    expect(b.size).toBe(0);
  });

  test("regression: a modal can carry bot-owned metadata without a type error", () => {
    const registry = new ModalRegistry();
    const modal = defineModal({
      prefix: "curate:submit:",
      metadata: { category: "music" },
      execute: async () => {},
    });

    registry.register(modal);
    expect(registry.resolve("curate:submit:1")?.metadata as Record<string, unknown> | undefined).toEqual({
      category: "music",
    });
  });
});
