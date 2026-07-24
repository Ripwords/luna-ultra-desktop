import { describe, expect, it } from "vitest";
import { COLOR_MODE_GAMMA, WHITE_BALANCE_KELVIN } from "~/utils/cameraControls";
import { enumNames } from "~/utils/lunaProto";

describe("WHITE_BALANCE_KELVIN", () => {
  it("pairs each white balance preset with a Kelvin", () => {
    expect(WHITE_BALANCE_KELVIN.WB_AUTO).toBe(0);
    expect(WHITE_BALANCE_KELVIN.WB_5000K).toBe(5000);
  });

  it("covers every WhiteBalance enum value the camera offers", () => {
    for (const name of enumNames("insta360.messages.PhotographyOptions.WhiteBalance")) {
      expect(WHITE_BALANCE_KELVIN[name], `missing Kelvin for ${name}`).toBeTypeOf("number");
    }
  });
});

describe("COLOR_MODE_GAMMA", () => {
  it("pairs each colour mode with a gamma", () => {
    expect(COLOR_MODE_GAMMA.COLOR_MODE_LOG).toBe("LOG");
    expect(COLOR_MODE_GAMMA.COLOR_MODE_NORMAL).toBe("STANDARD");
  });

  it("covers every COLOR_MODE value, and each maps to a real GammaMode", () => {
    const gammas = new Set(enumNames("insta360.messages.GammaMode"));
    for (const name of enumNames("insta360.messages.PhotographyOptions.COLOR_MODE")) {
      const gamma = COLOR_MODE_GAMMA[name];
      expect(gamma, `missing gamma for ${name}`).toBeDefined();
      expect(gammas.has(gamma!), `${gamma} is not a GammaMode`).toBe(true);
    }
  });
});
