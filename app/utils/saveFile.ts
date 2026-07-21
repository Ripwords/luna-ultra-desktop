declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Save a blob to disk. Inside Tauri this writes into the user's Downloads
 * folder via the fs plugin; in a plain browser it falls back to an anchor
 * download. Returns a human-readable location.
 */
export async function saveBlob(blob: Blob, fileName: string): Promise<string> {
  if (isTauri()) {
    const { writeFile, BaseDirectory, mkdir } = await import("@tauri-apps/plugin-fs");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await mkdir("Luna Ultra", { baseDir: BaseDirectory.Download, recursive: true });
    const path = `Luna Ultra/${fileName}`;
    await writeFile(path, bytes, { baseDir: BaseDirectory.Download });
    return `Downloads/${path}`;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return `Downloads/${fileName}`;
}
