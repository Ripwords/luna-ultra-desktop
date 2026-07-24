import { describe, expect, it } from "vitest";
import {
  MSG,
  decodeMessage,
  encodeMessage,
  enumNames,
  enumValue,
  isDefaultValue,
} from "~/utils/lunaProto";

const hex = (s: string) => new Uint8Array(s.match(/../g)!.map((b) => parseInt(b, 16)));

describe("decodeMessage", () => {
  it("decodes a real CAMERA_POSTURE response", () => {
    // 085d 1203 e80501 — option_types=93, value{ camera_posture=1 }
    const decoded = decodeMessage(MSG.GetOptionsResp, hex("085d1203e80501"));
    expect(decoded.option_types).toEqual(["CAMERA_POSTURE"]);
    expect((decoded.value as Record<string, unknown>).camera_posture).toBe(
      "CAMERA_POSTURE_ROTATE_90",
    );
  });

  it("decodes a real WINDOW_CROP_INFO response with a nested message", () => {
    const decoded = decodeMessage(
      MSG.GetOptionsResp,
      hex("087c120fe2070c080010001800200028003000"),
    );
    const crop = (decoded.value as Record<string, Record<string, unknown>>).window_crop_info;
    expect(crop).toEqual({
      src_width: 0,
      src_height: 0,
      dst_width: 0,
      dst_height: 0,
      crop_offset_x: 0,
      crop_offset_y: 0,
    });
  });

  it("decodes a real empty PTZ_CTRL response without inventing fields", () => {
    // The camera answered with an empty value and no option_types echo
    const decoded = decodeMessage(MSG.GetOptionsResp, hex("1200"));
    expect(decoded.option_types).toBeUndefined();
    expect(decoded.value).toEqual({});
  });

  it("keeps fields the schema does not know under $unknown", () => {
    // field 200 varint 7 cannot be in GetOptionsResp, which has only 1 and 2
    const decoded = decodeMessage(MSG.GetOptionsResp, hex("c00c07"));
    expect(decoded.$unknown).toEqual([{ field: 200, wire: 0, value: "7" }]);
  });

  it("reports an out-of-range enum as its number, not a crash", () => {
    // photo_sub_mode (field 40) = 8, which postdates the schema's PhotoSubMode
    const decoded = decodeMessage(MSG.Options, hex("c00208"));
    expect(decoded.photo_sub_mode).toBe(8);
  });
});

describe("encodeMessage", () => {
  it("encodes a GetPhotographyOptions request the camera accepted", () => {
    // Unpacked repeated enums, matching the captured request shape
    const bytes = encodeMessage(MSG.GetPhotographyOptions, {
      option_types: ["EXPOSURE_MODE", "WHITE_BALANCE"],
      function_mode: "FUNCTION_MODE_NORMAL_VIDEO",
    });
    const decoded = decodeMessage(MSG.GetPhotographyOptions, bytes);
    expect(decoded.option_types).toEqual(["EXPOSURE_MODE", "WHITE_BALANCE"]);
    expect(decoded.function_mode).toBe("FUNCTION_MODE_NORMAL_VIDEO");
  });

  it("round-trips a nested settings write", () => {
    const bytes = encodeMessage(MSG.SetPhotographyOptions, {
      option_types: ["WHITE_BALANCE_VALUE", "EXPOSURE_BIAS"],
      value: { white_balance_value: 5600 },
      function_mode: "FUNCTION_MODE_NORMAL_VIDEO",
    });
    const decoded = decodeMessage(MSG.SetPhotographyOptions, bytes);
    expect(decoded.option_types).toEqual(["WHITE_BALANCE_VALUE", "EXPOSURE_BIAS"]);
    expect((decoded.value as Record<string, unknown>).white_balance_value).toBe(5600);
  });

  it("round-trips a double, which zoom and focal length use", () => {
    const bytes = encodeMessage(MSG.PhotographyOptions, { focal_length_value: 17.4 });
    expect(decodeMessage(MSG.PhotographyOptions, bytes).focal_length_value as number).toBeCloseTo(
      17.4,
      6,
    );
  });

  it("omits proto3 default values, as the camera does", () => {
    expect(encodeMessage(MSG.PhotographyOptions, { exposure_bias: 0 }).length).toBe(0);
  });

  it("throws on an unknown field name rather than silently dropping it", () => {
    expect(() => encodeMessage(MSG.PhotographyOptions, { not_a_field: 1 })).toThrow(/not_a_field/);
  });

  it("throws on an unknown enum name", () => {
    expect(() => encodeMessage(MSG.PhotographyOptions, { white_balance: "WB_9999K" })).toThrow(
      /WB_9999K/,
    );
  });
});

describe("enum helpers", () => {
  it("maps names to numbers", () => {
    expect(enumValue("insta360.messages.PhotographyOptions.WhiteBalance", "WB_5000K")).toBe(3);
  });

  it("lists names for building UI pickers", () => {
    const names = enumNames("insta360.messages.PhotographyOptions.WhiteBalance");
    expect(names).toContain("WB_AUTO");
    expect(names).toContain("WB_6500K");
  });
});

describe("isDefaultValue", () => {
  const PO = MSG.PhotographyOptions;

  it("treats a bool false as the default and true as set", () => {
    expect(isDefaultValue(PO, "metering_enable", false)).toBe(true);
    expect(isDefaultValue(PO, "metering_enable", true)).toBe(false);
  });

  it("treats a numeric zero as the default", () => {
    expect(isDefaultValue(PO, "sharpness", 0)).toBe(true);
    expect(isDefaultValue(PO, "sharpness", 3)).toBe(false);
  });

  it("resolves an enum value-name to its number: the zero value is the default", () => {
    // WhiteBalance: WB_AUTO=0, WB_5000K=3
    expect(isDefaultValue(PO, "white_balance", "WB_AUTO")).toBe(true);
    expect(isDefaultValue(PO, "white_balance", "WB_5000K")).toBe(false);
    expect(isDefaultValue(PO, "white_balance", 0)).toBe(true);
  });

  it("treats a nested message value as non-default", () => {
    expect(isDefaultValue(PO, "exposure_manual", { iso: 0 })).toBe(false);
  });

  it("treats an unknown field as non-default rather than guessing", () => {
    expect(isDefaultValue(PO, "not_a_field", 0)).toBe(false);
  });
});
