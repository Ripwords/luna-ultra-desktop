import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAILURE_THRESHOLD,
  armCameraHealth,
  disarmCameraHealth,
  reportCameraFailure,
  reportCameraSuccess,
} from "~/utils/cameraHealth";

describe("cameraHealth", () => {
  beforeEach(() => {
    disarmCameraHealth();
  });

  it("fires once after three consecutive failures", () => {
    const onDead = vi.fn();
    armCameraHealth(onDead);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) reportCameraFailure();
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it("does not fire before the threshold", () => {
    const onDead = vi.fn();
    armCameraHealth(onDead);
    for (let i = 0; i < FAILURE_THRESHOLD - 1; i++) reportCameraFailure();
    expect(onDead).not.toHaveBeenCalled();
  });

  it("resets the count on any success", () => {
    const onDead = vi.fn();
    armCameraHealth(onDead);
    reportCameraFailure();
    reportCameraSuccess();
    reportCameraFailure();
    reportCameraFailure();
    expect(onDead).not.toHaveBeenCalled();
  });

  it("ignores failures while disarmed", () => {
    const onDead = vi.fn();
    for (let i = 0; i < FAILURE_THRESHOLD; i++) reportCameraFailure();
    armCameraHealth(onDead);
    reportCameraFailure();
    expect(onDead).not.toHaveBeenCalled();
  });

  it("does not fire again after it has fired", () => {
    const onDead = vi.fn();
    armCameraHealth(onDead);
    for (let i = 0; i < FAILURE_THRESHOLD + 3; i++) reportCameraFailure();
    expect(onDead).toHaveBeenCalledTimes(1);
  });

  it("replaces the callback when armed twice", () => {
    const first = vi.fn();
    const second = vi.fn();
    armCameraHealth(first);
    reportCameraFailure();
    armCameraHealth(second);
    for (let i = 0; i < FAILURE_THRESHOLD; i++) reportCameraFailure();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
