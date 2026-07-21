import { describe, expect, it } from "vitest";
import { withCameraSlot, CAMERA_PRIORITY } from "~/utils/cameraQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("withCameraSlot", () => {
  it("never runs more than 2 transfers concurrently", async () => {
    let active = 0;
    let peak = 0;
    const task = () =>
      withCameraSlot(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all(Array.from({ length: 12 }, task));
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(0);
  });

  it("drains higher priority work first when slots free up", async () => {
    const order: string[] = [];
    // Occupy both slots with blockers we control.
    const b1 = deferred<void>();
    const b2 = deferred<void>();
    const p1 = withCameraSlot(() => b1.promise);
    const p2 = withCameraSlot(() => b2.promise);
    // Queue a low- and a high-priority task while both slots are busy.
    const low = withCameraSlot(async () => {
      order.push("low");
    }, CAMERA_PRIORITY.THUMBNAIL);
    const high = withCameraSlot(async () => {
      order.push("high");
    }, CAMERA_PRIORITY.PREVIEW);
    // Free the slots; the higher-priority queued task should run first.
    b1.resolve();
    b2.resolve();
    await Promise.all([p1, p2, low, high]);
    expect(order[0]).toBe("high");
  });

  it("propagates errors and still frees the slot", async () => {
    await expect(withCameraSlot(async () => {
      throw new Error("boom");
    })).rejects.toThrow("boom");
    // A subsequent task still runs (slot was released).
    await expect(withCameraSlot(async () => 42)).resolves.toBe(42);
  });
});
