import { describe, expect, it } from "vitest";
import { ISO_STEPS, isoLabel, shutterLabel, shutterSteps } from "~/utils/cameraLabels";

describe("shutterLabel", () => {
  it("renders fractions, where D means divide", () => {
    expect(shutterLabel("SPEED_1D8000")).toBe("1/8000");
    expect(shutterLabel("SPEED_1D60")).toBe("1/60");
    expect(shutterLabel("SPEED_1D2")).toBe("1/2");
  });

  it("renders whole seconds with a unit", () => {
    expect(shutterLabel("SPEED_60")).toBe("60s");
    expect(shutterLabel("SPEED_1")).toBe("1s");
  });

  it("renders decimals, where P is the decimal point", () => {
    expect(shutterLabel("SPEED_1P6")).toBe("1.6s");
    expect(shutterLabel("SPEED_1P3")).toBe("1.3s");
  });

  it("handles fractions with a decimal denominator", () => {
    expect(shutterLabel("SPEED_1D1P25")).toBe("1/1.25");
    expect(shutterLabel("SPEED_1D12P5")).toBe("1/12.5");
  });

  it("names auto plainly", () => {
    expect(shutterLabel("SPEED_AUTO")).toBe("Auto");
  });

  it("passes through anything it does not recognise", () => {
    expect(shutterLabel("SPEED_FUTURE_VALUE")).toBe("SPEED_FUTURE_VALUE");
    expect(shutterLabel("")).toBe("");
  });

  it("tolerates the trailing marker seen on SPEED_1D8P", () => {
    expect(shutterLabel("SPEED_1D8P")).toBe("1/8");
  });
});

describe("shutterSteps", () => {
  it("runs from Auto through to the fastest speed", () => {
    const steps = shutterSteps();
    expect(steps[0]).toEqual({ value: "SPEED_AUTO", label: "Auto" });
    expect(steps.at(-1)).toEqual({ value: "SPEED_1D8000", label: "1/8000" });
  });

  it("covers every value the camera defines", () => {
    expect(shutterSteps()).toHaveLength(49);
  });
});

describe("isoLabel", () => {
  it("shows zero as auto, because that is what the camera means by it", () => {
    expect(isoLabel(0)).toBe("Auto");
  });

  it("shows other values verbatim", () => {
    expect(isoLabel(400)).toBe("400");
  });
});

describe("ISO_STEPS", () => {
  it("starts at auto and climbs in stops", () => {
    expect(ISO_STEPS[0]).toBe(0);
    expect(ISO_STEPS).toContain(100);
    expect(ISO_STEPS).toContain(6400);
  });
});
