import { describe, expect, it } from "vitest";
import { rangeSelect, toggleGroup, toggleId } from "~/utils/selection";

describe("toggleId", () => {
  it("adds an unselected id", () => {
    expect([...toggleId(new Set(), "a")]).toEqual(["a"]);
  });

  it("removes a selected id", () => {
    expect(toggleId(new Set(["a", "b"]), "a").has("a")).toBe(false);
  });

  it("does not mutate the input set", () => {
    const input = new Set(["a"]);
    toggleId(input, "b");
    expect([...input]).toEqual(["a"]);
  });
});

describe("rangeSelect", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("selects the inclusive range between anchor and target", () => {
    const result = rangeSelect(order, new Set(["b"]), "b", "d");
    expect([...result].sort()).toEqual(["b", "c", "d"]);
  });

  it("works when the target is before the anchor", () => {
    const result = rangeSelect(order, new Set(["d"]), "d", "b");
    expect([...result].sort()).toEqual(["b", "c", "d"]);
  });

  it("falls back to toggling when there is no anchor", () => {
    const result = rangeSelect(order, new Set(), null, "c");
    expect([...result]).toEqual(["c"]);
  });

  it("keeps prior selections outside the range", () => {
    const result = rangeSelect(order, new Set(["a"]), "c", "e");
    expect([...result].sort()).toEqual(["a", "c", "d", "e"]);
  });
});

describe("toggleGroup", () => {
  it("selects every id in the group when some are missing", () => {
    const result = toggleGroup(new Set(["a"]), ["a", "b", "c"]);
    expect([...result].sort()).toEqual(["a", "b", "c"]);
  });

  it("clears the group when all ids are already selected", () => {
    const result = toggleGroup(new Set(["a", "b", "x"]), ["a", "b"]);
    expect([...result]).toEqual(["x"]);
  });
});
