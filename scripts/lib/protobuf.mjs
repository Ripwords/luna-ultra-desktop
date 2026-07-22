// Minimal protobuf wire-format reader for the probe scripts.
//
// Deliberately schema-optional: it decodes the raw wire first and only then
// annotates with names. Fields the schema does not explain are still reported,
// which is the whole point — the schemas come from 2020-era hardware and this
// camera is newer, so the unknowns are the interesting part.

export function readVarint(buffer, at) {
  let value = 0;
  let shift = 1;
  for (;;) {
    if (at >= buffer.length) return null;
    const byte = buffer[at++];
    value += (byte & 0x7f) * shift;
    if ((byte & 0x80) === 0) break;
    shift *= 128;
  }
  return { value, at };
}

/** Decode one message into raw {field, wire, value} records. */
export function decodeRaw(buffer) {
  const out = [];
  let at = 0;
  while (at < buffer.length) {
    const tag = readVarint(buffer, at);
    if (!tag) break;
    at = tag.at;
    const field = Math.floor(tag.value / 8);
    const wire = tag.value & 7;
    if (field === 0) break;

    if (wire === 0) {
      const v = readVarint(buffer, at);
      if (!v) break;
      at = v.at;
      out.push({ field, wire, value: v.value });
    } else if (wire === 1) {
      if (at + 8 > buffer.length) break;
      out.push({ field, wire, value: buffer.subarray(at, at + 8) });
      at += 8;
    } else if (wire === 2) {
      const len = readVarint(buffer, at);
      if (!len || len.at + len.value > buffer.length) break;
      out.push({ field, wire, value: buffer.subarray(len.at, len.at + len.value) });
      at = len.at + len.value;
    } else if (wire === 5) {
      if (at + 4 > buffer.length) break;
      out.push({ field, wire, value: buffer.subarray(at, at + 4) });
      at += 4;
    } else {
      break; // groups: not used by this protocol
    }
  }
  return out;
}

const printable = (buffer) =>
  buffer.length > 0 && buffer.every((b) => b === 0x09 || b === 0x0a || (b >= 0x20 && b <= 0x7e));

/**
 * Annotate raw records against a message schema. Returns rows shaped for
 * display: { field, name, value, note }. `name` is "?" when the schema has
 * nothing for that field number.
 */
export function annotate(buffer, messageName, schema, depth = 0) {
  const spec = schema.messages[messageName] ?? {};
  const rows = [];

  for (const record of decodeRaw(buffer)) {
    const def = spec[String(record.field)];
    const name = def?.name ?? "?";
    let value;
    let note = "";

    if (!def) {
      // Unknown field: report the wire truth so we can learn from it
      value =
        record.wire === 2
          ? printable(record.value)
            ? JSON.stringify(record.value.toString("utf8"))
            : `${record.value.length}B ${record.value.subarray(0, 16).toString("hex")}`
          : record.value instanceof Buffer
            ? record.value.toString("hex")
            : record.value;
      note = `unknown, wire ${record.wire}`;
      rows.push({ field: record.field, name, value, note, depth });
      continue;
    }

    if (def.type === "message" && record.wire === 2) {
      rows.push({ field: record.field, name, value: "{", note: def.ref ?? "", depth });
      rows.push(...annotate(record.value, def.ref, schema, depth + 1));
      rows.push({ field: record.field, name: "", value: "}", note: "", depth });
      continue;
    }

    if (def.type === "double" && record.wire === 1) {
      value = record.value.readDoubleLE(0);
    } else if (def.type === "float" && record.wire === 5) {
      value = record.value.readFloatLE(0);
    } else if (def.type === "string" && record.wire === 2) {
      value = JSON.stringify(record.value.toString("utf8"));
    } else if (def.type === "bytes" && record.wire === 2) {
      value = `${record.value.length}B ${record.value.subarray(0, 16).toString("hex")}`;
    } else if (def.type === "enum" && record.wire === 0) {
      const names = schema.enums[def.ref] ?? {};
      value = names[String(record.value)] ?? record.value;
      if (!names[String(record.value)]) note = `value ${record.value} not in ${shortName(def.ref)}`;
    } else if (def.type === "enum" && record.wire === 2) {
      // Packed repeated enum
      const names = schema.enums[def.ref] ?? {};
      const values = [];
      let at = 0;
      while (at < record.value.length) {
        const v = readVarint(record.value, at);
        if (!v) break;
        at = v.at;
        values.push(names[String(v.value)] ?? v.value);
      }
      value = values.join(", ");
    } else if (def.type === "bool") {
      value = record.value === 1;
    } else {
      value = record.value instanceof Buffer ? record.value.toString("hex") : record.value;
      if (record.wire === 1 || record.wire === 5) note = `raw, declared ${def.type}`;
    }

    rows.push({ field: record.field, name, value, note, depth });
  }
  return rows;
}

export const shortName = (full) => (full ? full.split(".").pop() : "");

export function renderRows(rows) {
  const lines = [];
  for (const row of rows) {
    const indent = "  ".repeat(row.depth);
    const label = row.name ? `${row.name}` : "";
    const tag = String(row.field).padStart(3);
    const note = row.note ? `   // ${row.note}` : "";
    lines.push(`  ${tag}  ${indent}${label.padEnd(28 - indent.length)} ${row.value}${note}`);
  }
  return lines.join("\n");
}
