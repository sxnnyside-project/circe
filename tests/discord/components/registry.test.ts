import { describe, expect, test } from "bun:test";
import { ComponentError } from "../../../src/discord/components/errors.js";
import { ComponentRegistry } from "../../../src/discord/components/registry.js";
import type { ComponentDefinition } from "../../../src/discord/components/types.js";
import { defineComponent } from "../../../src/discord/components/types.js";

function makeComponent(prefix: string): ComponentDefinition {
  return { prefix, execute: async () => {} };
}

describe("ComponentRegistry", () => {
  test("registers and resolves a handler by exact-matching prefix", () => {
    const registry = new ComponentRegistry();
    const handler = makeComponent("crate:save:");

    registry.register(handler);

    expect(registry.resolve("crate:save:123")).toBe(handler);
    expect(registry.has("crate:save:")).toBe(true);
    expect(registry.size).toBe(1);
  });

  test("returns undefined for a customId with no matching prefix", () => {
    const registry = new ComponentRegistry();
    registry.register(makeComponent("crate:save:"));

    expect(registry.resolve("profile:view:1")).toBeUndefined();
  });

  test("throws ComponentError on an exact duplicate prefix", () => {
    const registry = new ComponentRegistry();
    registry.register(makeComponent("crate:save:"));

    expect(() => registry.register(makeComponent("crate:save:"))).toThrow(ComponentError);
  });

  test("throws ComponentError when the prefix is empty", () => {
    const registry = new ComponentRegistry();
    expect(() => registry.register(makeComponent(""))).toThrow(ComponentError);
  });

  test("resolves the longest (most specific) matching prefix, regardless of registration order", () => {
    const registry = new ComponentRegistry();
    const general = makeComponent("crate:");
    const specific = makeComponent("crate:save:");

    registry.register(general);
    registry.register(specific);

    expect(registry.resolve("crate:save:123")).toBe(specific);
    expect(registry.resolve("crate:remove:123")).toBe(general);
  });

  test("longest-prefix resolution does not depend on registration order", () => {
    const registry = new ComponentRegistry();
    const general = makeComponent("crate:");
    const specific = makeComponent("crate:save:");

    // Register in the opposite order from the previous test.
    registry.register(specific);
    registry.register(general);

    expect(registry.resolve("crate:save:123")).toBe(specific);
  });

  test("different, non-conflicting prefixes are not treated as duplicates", () => {
    const registry = new ComponentRegistry();
    expect(() => {
      registry.register(makeComponent("crate:"));
      registry.register(makeComponent("crate:save:"));
    }).not.toThrow();
    expect(registry.size).toBe(2);
  });

  test("exposes all registered handlers", () => {
    const registry = new ComponentRegistry();
    registry.register(makeComponent("a:"));
    registry.register(makeComponent("b:"));

    expect(registry.all.map((c) => c.prefix).sort()).toEqual(["a:", "b:"]);
  });

  test("two independent registries never share state", () => {
    const a = new ComponentRegistry();
    const b = new ComponentRegistry();
    a.register(makeComponent("only-in-a:"));

    expect(a.size).toBe(1);
    expect(b.size).toBe(0);
  });

  test("regression: a component can carry bot-owned metadata without a type error", () => {
    const registry = new ComponentRegistry();
    const component = defineComponent({
      prefix: "crate:save:",
      metadata: { category: "music" },
      execute: async () => {},
    });

    registry.register(component);
    expect(registry.resolve("crate:save:1")?.metadata as Record<string, unknown> | undefined).toEqual({
      category: "music",
    });
  });
});
