import type { MediaItem } from "~/types/media";

export interface MediaGroup {
  key: string;
  items: MediaItem[];
}

/**
 * Best-guess image MIME type from a URL/filename extension. The camera often
 * serves files as application/octet-stream, which stops the browser from
 * rendering the blob; forcing the right type fixes JPEG-based formats like
 * `.insp`. Returns null for formats the browser can't render (e.g. `.dng`).
 */
export function imageMimeFor(urlOrName: string): string | null {
  const clean = urlOrName.split(/[?#]/)[0] ?? "";
  const ext = clean.slice(clean.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "bmp":
      return "image/bmp";
    case "jpg":
    case "jpeg":
    case "insp": // Insta360 photo container — JPEG bytes
      return "image/jpeg";
    default:
      return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value.toFixed(1)} ${unit}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function groupByDay(items: MediaItem[]): MediaGroup[] {
  const map = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = dayKey(item.takenAt);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, bucket]) => ({
      key,
      items: bucket.sort((a, b) => b.takenAt - a.takenAt),
    }));
}

export function dayLabel(key: string, now: Date = new Date()): string {
  const todayKey = dayKey(now.getTime());
  if (key === todayKey) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
