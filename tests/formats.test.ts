import { describe, expect, it } from "vitest";
import { imageMimeFor, videoMimeFor } from "~/utils/media";
import { parseLunaIndex } from "~/utils/lunaIndex";

const BASE = "http://192.168.42.1/storage_internal/DCIM/Camera01/";
const HTML = `<pre>
<a href="../">../</a>
<a href="IMG_20260718_142012_00_002.jpg">IMG_20260718_142012_00_002.jpg</a> 18-Jul-2026 14:20 18M
<a href="IMG_20260718_142012_00_003.dng">IMG_20260718_142012_00_003.dng</a> 18-Jul-2026 14:20 42M
<a href="PANO_20260718_150000_00_004.insp">PANO_20260718_150000_00_004.insp</a> 18-Jul-2026 15:00 12M
<a href="VID_20260718_160000_00_005.mp4">VID_20260718_160000_00_005.mp4</a> 18-Jul-2026 16:00 500M
</pre>`;

describe("imageMimeFor", () => {
  it("maps common renderable image extensions", () => {
    expect(imageMimeFor("a.jpg")).toBe("image/jpeg");
    expect(imageMimeFor("a.jpeg")).toBe("image/jpeg");
    expect(imageMimeFor("a.png")).toBe("image/png");
    expect(imageMimeFor("a.webp")).toBe("image/webp");
  });

  it("treats Insta360 .insp as JPEG", () => {
    expect(imageMimeFor("PANO_1.insp")).toBe("image/jpeg");
    expect(imageMimeFor("http://cam/PANO_1.insp?x=1")).toBe("image/jpeg");
  });

  it("returns null for raw/unrenderable formats", () => {
    expect(imageMimeFor("IMG_1.dng")).toBeNull();
    expect(imageMimeFor("VID_1.mp4")).toBeNull();
  });
});

describe("parseLunaIndex format + storage tagging", () => {
  const internal = parseLunaIndex(HTML, BASE, "internal");
  const byName = (n: string) => internal.find((f) => f.name.startsWith(n))!;

  it("tags every item with the given storage", () => {
    expect(internal.every((f) => f.storage === "internal")).toBe(true);
    const sd = parseLunaIndex(HTML, BASE, "sdcard");
    expect(sd.every((f) => f.storage === "sdcard")).toBe(true);
  });

  it("records the lowercase extension", () => {
    expect(byName("IMG_20260718_142012_00_002").ext).toBe("jpg");
    expect(byName("IMG_20260718_142012_00_003").ext).toBe("dng");
    expect(byName("PANO").ext).toBe("insp");
  });

  it("marks JPEG, INSP and video renderable but DNG not", () => {
    expect(byName("IMG_20260718_142012_00_002").renderable).toBe(true); // jpg
    expect(byName("PANO").renderable).toBe(true); // insp
    expect(byName("VID").renderable).toBe(true); // video
    expect(byName("IMG_20260718_142012_00_003").renderable).toBe(false); // dng (raw)
  });

  it("flags PANO_/insp shots as panoramic, others not", () => {
    expect(byName("PANO").panoramic).toBe(true); // PANO_ + .insp
    expect(byName("IMG_20260718_142012_00_002").panoramic).toBe(false); // plain jpg
    expect(byName("IMG_20260718_142012_00_003").panoramic).toBe(false); // dng
    expect(byName("VID").panoramic).toBe(false); // video
  });
});

describe("videoMimeFor", () => {
  it("maps video containers, treating LRV proxies as MP4", () => {
    expect(videoMimeFor("VID_1.mp4")).toBe("video/mp4");
    expect(videoMimeFor("LRV_1.lrv")).toBe("video/mp4");
    expect(videoMimeFor("VID_1.mov")).toBe("video/quicktime");
    expect(videoMimeFor("http://cam/VID_1.mp4?x=1")).toBe("video/mp4");
  });

  it("returns null for non-video types", () => {
    expect(videoMimeFor("a.jpg")).toBeNull();
    expect(videoMimeFor("a.dng")).toBeNull();
  });
});
