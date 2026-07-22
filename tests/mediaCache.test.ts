import { describe, expect, it } from "vitest";
import { createMediaCache } from "~/utils/mediaCache";

/** A string of `n` characters — the cache sizes strings by length. */
function sized(n: number, fill = "x") {
  return fill.repeat(n);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createMediaCache", () => {
  it("returns the stored value without re-invoking the loader", async () => {
    const cache = createMediaCache(1000);
    let calls = 0;
    const load = async () => {
      calls++;
      return "value";
    };

    expect(await cache.get("a", load)).toBe("value");
    expect(await cache.get("a", load)).toBe("value");
    expect(calls).toBe(1);
  });

  it("invokes the loader once for concurrent requests on one key", async () => {
    const cache = createMediaCache(1000);
    let calls = 0;
    const gate = deferred<void>();
    const load = async () => {
      calls++;
      await gate.promise;
      return "shared";
    };

    const both = Promise.all([cache.get("a", load), cache.get("a", load)]);
    gate.resolve();

    expect(await both).toEqual(["shared", "shared"]);
    expect(calls).toBe(1);
  });

  it("sizes blobs by byte length and strings by character length", async () => {
    const cache = createMediaCache(1000);
    await cache.get("blob", async () => new Blob([new Uint8Array(40)]));
    await cache.get("str", async () => sized(60));

    expect(cache.bytes()).toBe(100);
  });

  it("evicts the least-recently-used entry when over budget", async () => {
    const cache = createMediaCache(100);
    let cLoads = 0;
    await cache.get("a", async () => sized(40));
    await cache.get("b", async () => sized(40));
    // Pushes total to 120 > 100, so the coldest entry ("a") must go.
    await cache.get("c", async () => {
      cLoads++;
      return sized(40);
    });

    expect(cache.bytes()).toBeLessThanOrEqual(100);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cLoads).toBe(1);
  });

  it("protects an entry that was read again", async () => {
    const cache = createMediaCache(100);
    await cache.get("a", async () => sized(40));
    await cache.get("b", async () => sized(40));
    // Touch "a" so "b" becomes the coldest.
    await cache.get("a", async () => sized(40));
    await cache.get("c", async () => sized(40));

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("keeps a single entry larger than the whole budget", async () => {
    const cache = createMediaCache(100);
    await cache.get("huge", async () => sized(500));

    expect(cache.has("huge")).toBe(true);
  });

  it("caches a null result so a doomed source is not retried", async () => {
    const cache = createMediaCache(1000);
    let calls = 0;
    const load = async () => {
      calls++;
      return null;
    };

    expect(await cache.get("a", load)).toBeNull();
    expect(await cache.get("a", load)).toBeNull();
    expect(calls).toBe(1);
  });

  it("does not cache a rejected load, leaving it retryable", async () => {
    const cache = createMediaCache(1000);
    let calls = 0;
    const load = async () => {
      calls++;
      if (calls === 1) throw new Error("wifi dropped");
      return "recovered";
    };

    await expect(cache.get("a", load)).rejects.toThrow("wifi dropped");
    expect(cache.has("a")).toBe(false);
    expect(await cache.get("a", load)).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("stays within budget across a mix of entry sizes", async () => {
    const cache = createMediaCache(200);
    for (let i = 0; i < 20; i++) {
      await cache.get(`k${i}`, async () => sized(i % 2 === 0 ? 10 : 70));
      expect(cache.bytes()).toBeLessThanOrEqual(200);
    }
  });

  it("clear() drops every entry", async () => {
    const cache = createMediaCache(1000);
    await cache.get("a", async () => sized(10));
    cache.clear();

    expect(cache.bytes()).toBe(0);
    expect(cache.has("a")).toBe(false);
  });
});
