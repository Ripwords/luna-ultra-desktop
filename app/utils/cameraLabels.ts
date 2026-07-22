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

/** The camera treats ISO 0 as automatic. */
export const isoLabel = (value: number): string => (value === 0 ? "Auto" : String(value));

export const ISO_STEPS = [0, 100, 200, 400, 800, 1600, 3200, 6400];

export const isoSteps = (): WheelStep[] =>
  ISO_STEPS.map((value) => ({ value: String(value), label: isoLabel(value) }));
