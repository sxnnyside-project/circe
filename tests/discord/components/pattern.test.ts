import { describe, expect, test } from "bun:test";
import { compilePattern } from "../../../src/discord/components/pattern.js";

describe("compilePattern", () => {
  test("derives the prefix from the static segments before the first param", () => {
    const compiled = compilePattern("ticket:close:[userId]:[action]");
    expect(compiled.prefix).toBe("ticket:close:");
  });

  test("extracts named params from a matching customId", () => {
    const compiled = compilePattern("ticket:close:[userId]:[action]");
    expect(compiled.parse("ticket:close:9841:archive")).toEqual({ userId: "9841", action: "archive" });
  });

  test("supports a pattern with a single param at the end", () => {
    const compiled = compilePattern("crate:save:[trackId]");
    expect(compiled.prefix).toBe("crate:save:");
    expect(compiled.parse("crate:save:abc123")).toEqual({ trackId: "abc123" });
  });

  test("supports a pattern with no params at all", () => {
    const compiled = compilePattern("crate:save");
    expect(compiled.prefix).toBe("crate:save:");
    expect(compiled.parse("crate:save")).toEqual({});
  });

  test("throws when the pattern has no static segment before the first param", () => {
    expect(() => compilePattern("[id]:action")).toThrow(/static segment/);
  });

  test("parse throws when the customId has too few segments", () => {
    const compiled = compilePattern("ticket:close:[userId]:[action]");
    expect(() => compiled.parse("ticket:close:9841")).toThrow(/does not match pattern/);
  });

  test("parse throws when the customId has too many segments", () => {
    const compiled = compilePattern("ticket:close:[userId]:[action]");
    expect(() => compiled.parse("ticket:close:9841:archive:extra")).toThrow(/does not match pattern/);
  });

  test("parse throws when a static segment doesn't match", () => {
    const compiled = compilePattern("ticket:close:[userId]");
    expect(() => compiled.parse("ticket:open:9841")).toThrow(/does not match pattern/);
  });

  test("does not treat a literal colon-delimited segment containing brackets as a param unless it's exactly [name]", () => {
    const compiled = compilePattern("crate:sa[ve:[id]");
    // The "sa[ve" segment is static (not shaped like a whole [param] segment) and must be escaped safely for regex.
    expect(compiled.parse("crate:sa[ve:123")).toEqual({ id: "123" });
    expect(() => compiled.parse("crate:saXve:123")).toThrow();
  });
});
