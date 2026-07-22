import type { CameraInfo, MediaItem, MediaStorage } from "~/types/media";
import { isTauri } from "~/utils/saveFile";
import { extractCameraSubdirs, parseLunaIndex } from "~/utils/lunaIndex";
import { reportCameraFailure, reportCameraSuccess } from "~/utils/cameraHealth";

/** Storage roots the Luna Ultra exposes over HTTP, default first. */
const STORAGE_ROOTS: Array<{ path: string; id: MediaStorage }> = [
  { path: "/storage_internal/DCIM/", id: "internal" },
  { path: "/DCIM/", id: "sdcard" },
];

interface RawDeviceInfo {
  host: string;
  deviceName?: string;
  serial?: string;
  firmware?: string;
  ssid?: string;
}

function normalizeHost(host: string): string {
  return host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function baseUrl(host: string, path: string): string {
  return `http://${normalizeHost(host)}${path}`;
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/**
 * Fetch a camera URL. Uses the Tauri HTTP plugin (bypasses CORS/mixed-content)
 * when packaged. Every camera request flows through here, so this is also
 * where the health counter is fed: a completed response of any status means
 * the camera answered, a thrown request means it did not.
 */
export async function cameraFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    let response: Response;
    if (isTauri()) {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      response = await tauriFetch(url, init);
    } else {
      response = await fetch(url, init);
    }
    reportCameraSuccess();
    return response;
  } catch (error) {
    reportCameraFailure();
    throw error;
  }
}

function toInfo(raw: RawDeviceInfo): CameraInfo {
  return {
    host: raw.host,
    deviceName: raw.deviceName,
    serial: raw.serial,
    firmware: raw.firmware,
    ssid: raw.ssid,
  };
}

export const lunaClient = {
  get available(): boolean {
    return isTauri();
  },

  /** Open the TCP control session; returns parsed device info. Tauri only. */
  async connect(host: string): Promise<CameraInfo> {
    const raw = await tauriInvoke<RawDeviceInfo>("luna_connect", { host: normalizeHost(host) });
    return toInfo(raw);
  },

  async disconnect(): Promise<void> {
    if (isTauri()) await tauriInvoke("luna_disconnect");
  },

  async status(): Promise<CameraInfo | null> {
    if (!isTauri()) return null;
    const raw = await tauriInvoke<RawDeviceInfo | null>("luna_status");
    return raw ? toInfo(raw) : null;
  },

  async deleteFiles(cameraPaths: string[]): Promise<void> {
    await tauriInvoke("luna_delete_files", { paths: cameraPaths });
  },

  /**
   * Read the full media library by walking each storage root's CameraNN
   * subdirectories. Requires a live control session (it authorizes HTTP).
   */
  async listMedia(host: string): Promise<MediaItem[]> {
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    for (const storage of STORAGE_ROOTS) {
      const rootUrl = baseUrl(host, storage.path);
      let rootHtml: string;
      try {
        const response = await cameraFetch(rootUrl, { headers: { "Cache-Control": "no-cache" } });
        if (!response.ok) continue;
        rootHtml = await response.text();
      } catch {
        continue;
      }

      const subdirs = extractCameraSubdirs(rootHtml);
      // Some firmwares list files directly at the storage root
      const listings = subdirs.length > 0 ? subdirs.map((dir) => `${storage.path}${dir}/`) : [storage.path];
      for (const listingPath of listings) {
        const url = baseUrl(host, listingPath);
        try {
          const response = await cameraFetch(url, { headers: { "Cache-Control": "no-cache" } });
          if (!response.ok) continue;
          const html = await response.text();
          for (const item of parseLunaIndex(html, url, storage.id)) {
            if (seen.has(item.cameraPath)) continue;
            seen.add(item.cameraPath);
            items.push(item);
          }
        } catch {
          // Skip unreachable listing, keep whatever else resolved
        }
      }
    }
    items.sort((a, b) => b.takenAt - a.takenAt);
    return items;
  },
};
