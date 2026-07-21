import { isTauri } from "~/utils/saveFile";

export type UpdaterPhase = "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "uptodate";

/**
 * Wraps the Tauri updater plugin. In a browser (no desktop runtime) every
 * action is a no-op so the UI can render identically everywhere.
 */
export function useUpdater() {
  const phase = useState<UpdaterPhase>("updater-phase", () => "idle");
  const version = useState<string | null>("updater-version", () => null);
  const notes = useState<string | null>("updater-notes", () => null);
  const progress = useState<number>("updater-progress", () => 0);
  const errorMessage = useState<string | null>("updater-error", () => null);

  const available = computed(() => isTauri());

  // Hold the pending update between check() and install()
  let pending: Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater")["check"]>> | null = null;

  async function check(silent = false) {
    if (!isTauri()) return;
    phase.value = "checking";
    errorMessage.value = null;
    try {
      const { check: checkUpdate } = await import("@tauri-apps/plugin-updater");
      pending = await checkUpdate();
      if (pending) {
        version.value = pending.version;
        notes.value = pending.body ?? null;
        phase.value = "available";
      } else {
        phase.value = silent ? "idle" : "uptodate";
      }
    } catch (e) {
      phase.value = "error";
      errorMessage.value = e instanceof Error ? e.message : "Update check failed.";
    }
  }

  async function install() {
    if (!pending) return;
    phase.value = "downloading";
    progress.value = 0;
    let downloaded = 0;
    let total = 0;
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          progress.value = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        } else if (event.event === "Finished") {
          progress.value = 100;
        }
      });
      phase.value = "ready";
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      phase.value = "error";
      errorMessage.value = e instanceof Error ? e.message : "Update installation failed.";
    }
  }

  function dismiss() {
    phase.value = "idle";
  }

  return { phase, version, notes, progress, errorMessage, available, check, install, dismiss };
}
