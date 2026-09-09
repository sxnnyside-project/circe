import { describe, expect, test } from "bun:test";
import { defineComponent } from "../../../src/discord/components/types.js";

describe("defineComponent", () => {
  test("passes through a prefix-based definition unchanged", () => {
    const definition = defineComponent({
      prefix: "crate:save:",
      execute: async () => {},
    });

    expect(definition.prefix).toBe("crate:save:");
    expect(definition.parse).toBeUndefined();
  });

  test("compiles a pattern-based definition into an equivalent prefix/parse definition", () => {
    const definition = defineComponent({
      pattern: "ticket:close:[userId]:[action]",
      execute: async () => {},
    });

    expect(definition.prefix).toBe("ticket:close:");
    expect(definition.parse?.("ticket:close:9841:archive")).toEqual({ userId: "9841", action: "archive" });
  });

  test("carries metadata through the pattern-compiling path", () => {
    const definition = defineComponent({
      pattern: "crate:save:[trackId]",
      metadata: { category: "music" },
      execute: async () => {},
    });

    expect(definition.metadata).toEqual({ category: "music" });
  });

  test("execute receives typed params extracted from the pattern at runtime", async () => {
    let received: unknown;
    const definition = defineComponent({
      pattern: "ticket:close:[userId]:[action]",
      execute: async (ctx) => {
        // Type-level: `ctx.params.userId`/`ctx.params.action` are `string`,
        // inferred from the pattern literal — this line only compiles if
        // that inference actually worked, which `bun run typecheck` verifies.
        received = { userId: ctx.params.userId, action: ctx.params.action };
      },
    });

    const params = definition.parse?.("ticket:close:9841:archive");
    await definition.execute({ params } as never);

    expect(received).toEqual({ userId: "9841", action: "archive" });
  });
});
