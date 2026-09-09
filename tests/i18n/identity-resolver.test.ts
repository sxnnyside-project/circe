import { describe, expect, test } from "bun:test";
import { IdentityI18nResolver } from "../../src/i18n/identity-resolver.js";

describe("IdentityI18nResolver", () => {
  test("returns the key verbatim, ignoring locale and params", () => {
    const resolver = new IdentityI18nResolver();
    expect(resolver.resolve("greeting.hello", "es-ES", { name: "Ana" })).toBe("greeting.hello");
  });

  test("returns the key verbatim with no params at all", () => {
    const resolver = new IdentityI18nResolver();
    expect(resolver.resolve("greeting.hello", "en-US")).toBe("greeting.hello");
  });
});
