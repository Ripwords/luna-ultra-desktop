import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, dayLabel, groupByDay } from "~/utils/media";
import type { MediaItem } from "~/types/media";

function item(id: string, takenAt: string, type: "photo" | "video" = "photo"): MediaItem {
  return {
    id,
    name: `IMG_${id}.jpg`,
    type,
    takenAt: new Date(takenAt).getTime(),
    size: 1024,
    width: 4000,
    height: 3000,
    thumbUrl: "",
    srcUrl: "",
  };
}

describe("formatBytes", () => {
  it("formats bytes below 1 KB", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatBytes(24_800_000)).toBe("23.7 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1_500_000_000)).toBe("1.4 GB");
  });
});

describe("formatDuration", () => {
  it("formats under a minute as 0:ss", () => {
    expect(formatDuration(42)).toBe("0:42");
  });

  it("pads seconds", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  it("formats hours", () => {
    expect(formatDuration(3671)).toBe("1:01:11");
  });
});

describe("groupByDay", () => {
  it("groups items by local calendar day, newest group first", () => {
    const groups = groupByDay([
      item("a", "2026-07-18T09:00:00"),
      item("b", "2026-07-19T10:00:00"),
      item("c", "2026-07-18T15:00:00"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-07-19", "2026-07-18"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["c", "a"]);
  });

  it("sorts items inside a group newest first", () => {
    const groups = groupByDay([
      item("early", "2026-07-18T08:00:00"),
      item("late", "2026-07-18T20:00:00"),
    ]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["late", "early"]);
  });

  it("returns an empty list for no items", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("dayLabel", () => {
  const today = new Date("2026-07-20T12:00:00");

  it("labels today", () => {
    expect(dayLabel("2026-07-20", today)).toBe("Today");
  });

  it("labels yesterday", () => {
    expect(dayLabel("2026-07-19", today)).toBe("Yesterday");
  });

  it("labels older days with a readable date", () => {
    expect(dayLabel("2026-07-04", today)).toBe("July 4, 2026");
  });
});
