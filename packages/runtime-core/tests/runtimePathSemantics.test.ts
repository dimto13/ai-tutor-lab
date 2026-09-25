import { describe, expect, it } from "vitest";
import { matchesRuntimePath } from "../src/runtimeAdapter.ts";

describe("runtime path comparison semantics", () => {
  it("accepts filename case differences for a case-insensitive profile", () => {
    expect(
      matchesRuntimePath("NOTIZ.txt", "notiz.txt", { pathComparison: "case-insensitive" }),
    ).toBe(true);
  });

  it("keeps filename case distinct for a case-sensitive profile", () => {
    expect(
      matchesRuntimePath("NOTIZ.txt", "notiz.txt", { pathComparison: "case-sensitive" }),
    ).toBe(false);
  });

  it("does not normalize non-case path differences", () => {
    expect(
      matchesRuntimePath("docs/notiz.txt", "src/notiz.txt", { pathComparison: "case-insensitive" }),
    ).toBe(false);
  });
});
