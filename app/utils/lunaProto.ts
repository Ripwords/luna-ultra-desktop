import schemaJson from "~/assets/luna-protocol-schema.json";
import {
  concatBytes,
  decodeRaw,
  encodeLengthDelimited,
  encodeTag,
  encodeVarint,
  WIRE_32BIT,
  WIRE_64BIT,
  WIRE_VARINT,
  zigzagDecode,
  zigzagEncode,
} from "~/utils/protobuf";

interface FieldSpec {
  name: string;
  type: string;
  repeated: boolean;
  ref?: string;
}
interface Schema {
  messages: Record<string, Record<string, FieldSpec>>;
  enums: Record<string, Record<string, string>>;
}

const schema = schemaJson as unknown as Schema;

export type ProtoValue = string | number | boolean | ProtoObject | ProtoValue[];
export interface ProtoObject {
  [key: string]: ProtoValue | undefined;
}

/** Message names used across the app, so typos fail at build rather than run time. */
export const MSG = {
  Options: "insta360.messages.Options",
  PhotographyOptions: "insta360.messages.PhotographyOptions",
  GetOptions: "insta360.messages.GetOptions",
  GetOptionsResp: "insta360.messages.GetOptionsResp",
  SetOptions: "insta360.messages.SetOptions",
  SetOptionsResp: "insta360.messages.SetOptionsResp",
  GetPhotographyOptions: "insta360.messages.GetPhotographyOptions",
  GetPhotographyOptionsResp: "insta360.messages.GetPhotographyOptionsResp",
  SetPhotographyOptions: "insta360.messages.SetPhotographyOptions",
  SetPhotographyOptionsResp: "insta360.messages.SetPhotographyOptionsResp",
  CameraCaptureStatus: "insta360.messages.CameraCaptureStatus",
  GetCurrentCaptureStatusResp: "insta360.messages.GetCurrentCaptureStatusResp",
  StartCapture: "insta360.messages.StartCapture",
  StopCapture: "insta360.messages.StopCapture",
  TakePicture: "insta360.messages.TakePicture",
} as const;

export const OPTION_TYPE = "insta360.messages.OptionType";
export const PHOTOGRAPHY_OPTION_TYPE = "insta360.messages.PhotographyOptionType";
export const FUNCTION_MODE = "insta360.messages.FunctionMode";

const VARINT_TYPES = new Set(["int32", "int64", "uint32", "uint64", "bool", "enum"]);
const ZIGZAG_TYPES = new Set(["sint32", "sint64"]);

export function enumValue(enumName: string, name: string): number | null {
  const values = schema.enums[enumName];
  if (!values) return null;
  for (const [number, candidate] of Object.entries(values)) {
    if (candidate === name) return Number(number);
  }
  return null;
}

export function enumNames(enumName: string): string[] {
  const values = schema.enums[enumName];
  if (!values) return [];
  return Object.entries(values)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, name]) => name);
}

export const enumLabel = (ref: string | undefined, value: number): string | number =>
  (ref ? schema.enums[ref]?.[String(value)] : undefined) ?? value;

const fieldsOf = (messageName: string): Record<string, FieldSpec> => {
  const fields = schema.messages[messageName];
  if (!fields) throw new Error(`unknown message ${messageName}`);
  return fields;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

function toNumber(spec: FieldSpec, value: ProtoValue): number {
  if (spec.type === "bool") return value ? 1 : 0;
  if (spec.type === "enum") {
    if (typeof value === "number") return value;
    const resolved = enumValue(spec.ref ?? "", String(value));
    if (resolved === null) throw new Error(`unknown enum value ${String(value)} for ${spec.name}`);
    return resolved;
  }
  return Number(value);
}

/** proto3 omits defaults on the wire; mirroring that keeps writes minimal. */
const isDefault = (spec: FieldSpec, value: ProtoValue): boolean =>
  spec.type === "bool" ? value === false : spec.type === "string" ? value === "" : value === 0;

function encodeField(number: number, spec: FieldSpec, value: ProtoValue): number[] {
  if (spec.type === "message") {
    return encodeLengthDelimited(number, encodeMessage(spec.ref ?? "", value as ProtoObject));
  }
  if (spec.type === "string") {
    return encodeLengthDelimited(number, new TextEncoder().encode(String(value)));
  }
  if (spec.type === "double") {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, Number(value), true);
    return [...encodeTag(number, WIRE_64BIT), ...bytes];
  }
  if (spec.type === "float") {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, Number(value), true);
    return [...encodeTag(number, WIRE_32BIT), ...bytes];
  }
  if (ZIGZAG_TYPES.has(spec.type)) {
    return [...encodeTag(number, WIRE_VARINT), ...encodeVarint(zigzagEncode(Number(value)))];
  }
  if (VARINT_TYPES.has(spec.type)) {
    return [...encodeTag(number, WIRE_VARINT), ...encodeVarint(toNumber(spec, value))];
  }
  throw new Error(`cannot encode ${spec.name}: unsupported type ${spec.type}`);
}

export function encodeMessage(messageName: string, value: ProtoObject): Uint8Array {
  const fields = fieldsOf(messageName);
  const byName = new Map(
    Object.entries(fields).map(([number, spec]) => [spec.name, { number, spec }]),
  );
  const parts: number[][] = [];

  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue;
    const entry = byName.get(key);
    if (!entry) throw new Error(`unknown field ${key} on ${messageName}`);
    const number = Number(entry.number);

    // Repeated scalars go out unpacked: that is the shape the camera's own
    // requests use, and packed encoding was never observed from it.
    const items = entry.spec.repeated && Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      if (!entry.spec.repeated && isDefault(entry.spec, item)) continue;
      parts.push(encodeField(number, entry.spec, item));
    }
  }
  return concatBytes(parts);
}

function decodeField(spec: FieldSpec, value: number | Uint8Array): ProtoValue {
  if (value instanceof Uint8Array) {
    if (spec.type === "message") return decodeMessage(spec.ref ?? "", value);
    if (spec.type === "string") return new TextDecoder().decode(value);
    if (spec.type === "double" && value.length === 8) {
      return new DataView(value.buffer, value.byteOffset, 8).getFloat64(0, true);
    }
    if (spec.type === "float" && value.length === 4) {
      return new DataView(value.buffer, value.byteOffset, 4).getFloat32(0, true);
    }
    // Bytes, or a wire type that disagreed with the schema: hand back hex
    // rather than guess at a meaning
    return toHex(value);
  }
  if (spec.type === "bool") return value === 1;
  if (spec.type === "enum") return enumLabel(spec.ref, value);
  if (ZIGZAG_TYPES.has(spec.type)) return zigzagDecode(value);
  return value;
}

/**
 * Decode by message name. Unknown fields are preserved under `$unknown` —
 * this camera is newer than the schema, so what it sends that we cannot name
 * is exactly what we want to see rather than discard.
 */
export function decodeMessage(messageName: string, bytes: Uint8Array): ProtoObject {
  const fields = fieldsOf(messageName);
  const out: ProtoObject = {};
  const unknown: Array<{ field: number; wire: number; value: string }> = [];

  for (const record of decodeRaw(bytes)) {
    const spec = fields[String(record.field)];
    if (!spec) {
      unknown.push({
        field: record.field,
        wire: record.wire,
        value: record.value instanceof Uint8Array ? toHex(record.value) : String(record.value),
      });
      continue;
    }
    const decoded = decodeField(spec, record.value);
    if (spec.repeated) {
      const list = (out[spec.name] as ProtoValue[] | undefined) ?? [];
      list.push(decoded);
      out[spec.name] = list;
    } else {
      out[spec.name] = decoded;
    }
  }
  if (unknown.length > 0) out.$unknown = unknown as unknown as ProtoValue;
  return out;
}
