/**
 * Human labels for the camera's exposure enums.
 *
 * The ShutterSpeed enum encodes its values in the name: `D` is a division bar
 * and `P` a decimal point, so `SPEED_1D8000` is 1/8000 and `SPEED_1P6` is
 * 1.6 seconds. Decoding that yields exactly the wheel the phone app shows.
 */

import { enumNames } from "~/utils/lunaProto";

export const SHUTTER_SPEED_ENUM = "insta360.messages.PhotographyOptions.ShutterSpeed";

export interface WheelStep {
  value: string;
  label: string;
}

const NUMERIC = /^\d+(?:P\d+)?P?$/;

/** `1P6` -> `1.6`, `12P5` -> `12.5`, `8P` -> `8`. */
const decimal = (part: string): string => part.replace(/P(\d+)/, ".$1").replace(/P$/, "");

export function shutterLabel(name: string): string {
  if (name === "SPEED_AUTO") return "Auto";
  if (!name.startsWith("SPEED_")) return name;

  const body = name.slice("SPEED_".length);
  const [numerator, denominator, ...rest] = body.split("D");
  if (rest.length > 0 || !numerator || !NUMERIC.test(numerator)) return name;

  if (denominator === undefined) return `${decimal(numerator)}s`;
  if (!NUMERIC.test(denominator)) return name;
  return `${decimal(numerator)}/${decimal(denominator)}`;
}

export const shutterSteps = (): WheelStep[] =>
  enumNames(SHUTTER_SPEED_ENUM).map((value) => ({ value, label: shutterLabel(value) }));

/**
 * A ShutterSpeed enum name as exposure time in seconds — the raw double the
 * camera's video_exposure/still_exposure fields expect. `SPEED_1D120` is 1/120,
 * `SPEED_1P3` is 1.3s. Auto (or anything unparseable) is 0.
 */
export function shutterSeconds(name: string): number {
  if (!name.startsWith("SPEED_") || name === "SPEED_AUTO") return 0;
  const toNum = (part: string): number => Number(part.replace(/P(\d+)/, ".$1").replace(/P$/, ""));
  const [numerator, denominator] = name.slice("SPEED_".length).split("D");
  const n = toNum(numerator ?? "");
  if (!Number.isFinite(n)) return 0;
  if (denominator === undefined) return n;
  const d = toNum(denominator);
  return d ? n / d : 0;
}

/**
 * Names the camera's own UI uses, where the raw enum value would not match it.
 * "COLOR_MODE_NORMAL" is "Standard" on the camera, "COLOR_MODE_LOG" is "i-Log",
 * and so on. Anything not listed falls back to a tidied form of its enum name.
 */
const FRIENDLY_LABELS: Record<string, string> = {
  // color_mode — the camera's "Color Mode" picker (Standard / i-Log / Dolby Vision)
  COLOR_MODE_NORMAL: "Standard",
  COLOR_MODE_LOG: "i-Log",
  COLOR_MODE_HDR: "Dolby Vision",
  // white balance presets
  WB_AUTO: "Auto",
  WB_2700K: "2700K",
  WB_4000K: "4000K",
  WB_5000K: "5000K",
  WB_6500K: "6500K",
  WB_7500K: "7500K",
  // gamma / Leica looks
  STANDARD: "Standard",
  LOG: "Log",
  VIVID: "Vivid",
  FLAT: "Flat",
  URBAN_1: "Urban 1",
  URBAN_2: "Urban 2",
  OCEANBLUE_1: "Ocean Blue 1",
  OCEANBLUE_2: "Ocean Blue 2",
  SNOW_1: "Snow 1",
  SNOW_2: "Snow 2",
  BIKING_1: "Biking 1",
  BIKING_2: "Biking 2",
  NIGHTLIGHT_1: "Night Light 1",
  NIGHTLIGHT_2: "Night Light 2",
};

/** Label an enum value the way the camera does, or tidy its name if unlisted. */
export const optionLabel = (value: string): string =>
  FRIENDLY_LABELS[value] ?? value.replace(/_/g, " ");

/**
 * Enum values the Luna Ultra does not actually offer, hidden from the pickers.
 * "Vivid" is a Leica *filter*, not one of the camera's color modes (which are
 * Standard / i-Log / Dolby Vision), and gamma_mode's Urban/Ocean Blue/Snow/…
 * entries are stale looks from the shared 2020-era schema that the Luna's Leica
 * filter set replaced — and those filters aren't reachable through this API.
 */
const HIDDEN_OPTIONS = new Set([
  "COLOR_MODE_VIVID",
  "URBAN_1",
  "URBAN_2",
  "OCEANBLUE_1",
  "OCEANBLUE_2",
  "SNOW_1",
  "SNOW_2",
  "BIKING_1",
  "BIKING_2",
  "NIGHTLIGHT_1",
  "NIGHTLIGHT_2",
]);

/** Enum values worth offering in a picker — drops ones this camera doesn't have. */
export const visibleEnumNames = (enumName: string): string[] =>
  enumNames(enumName).filter((value) => !HIDDEN_OPTIONS.has(value));

/** The nearest ShutterSpeed enum name for a raw seconds value, for showing the
 * wheel's current position back (video_exposure stores seconds, the wheel picks
 * enum steps). 0 seconds is Auto. */
export function shutterNameForSeconds(seconds: number): string {
  if (!seconds) return "SPEED_AUTO";
  let best = "SPEED_AUTO";
  let bestDiff = Infinity;
  for (const value of enumNames(SHUTTER_SPEED_ENUM)) {
    if (value === "SPEED_AUTO") continue;
    const diff = Math.abs(shutterSeconds(value) - seconds);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = value;
    }
  }
  return best;
}

/** The camera treats ISO 0 as automatic. */
export const isoLabel = (value: number): string => (value === 0 ? "Auto" : String(value));

export const ISO_STEPS = [0, 100, 200, 400, 800, 1600, 3200, 6400];

export const isoSteps = (): WheelStep[] =>
  ISO_STEPS.map((value) => ({ value: String(value), label: isoLabel(value) }));
