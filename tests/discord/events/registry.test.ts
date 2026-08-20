import { describe, expect, test } from "bun:test";
import { EventRegistry } from "../../../src/discord/events/registry.js";

describe("EventRegistry", () => {
  test("registers and exposes events", () => {
    const registry = new EventRegistry();
    registry.register({ name: "ready", execute: () => {} });

    expect(registry.size).toBe(1);
    expect(registry.all[0]?.name).toBe("ready");
  });

  test("allows multiple handlers for the same event name", () => {
    const registry = new EventRegistry();
    registry.register({ name: "guildCreate", execute: () => {} });
    registry.register({ name: "guildCreate", execute: () => {} });

    expect(registry.size).toBe(2);
  });

  test("two independent registries never share state", () => {
    const a = new EventRegistry();
    const b = new EventRegistry();
    a.register({ name: "ready", execute: () => {} });

    expect(a.size).toBe(1);
    expect(b.size).toBe(0);
  });
});
