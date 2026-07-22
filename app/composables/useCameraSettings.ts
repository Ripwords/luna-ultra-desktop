import type { ProtoObject, ProtoValue } from "~/utils/lunaProto";
import {
  readDeviceOptions,
  readPhotographyOption,
  readPhotographyOptions,
  writePhotographyOptions,
} from "~/utils/lunaSettings";

/**
 * What we actually know about a write, as opposed to what we hoped.
 * - `applied`   the camera read back the value we asked for
 * - `differs`   it read back something else, which is in `actual`
 * - `assumed`   it omitted the field, which proto3 does for defaults, so we
 *               cannot distinguish "applied the default" from "ignored us"
 * - `rejected`  it did not list the option type as accepted
 */
export type WriteOutcome = "applied" | "differs" | "assumed" | "rejected";

export interface WriteStatus {
  outcome: WriteOutcome;
  actual?: string;
  at: number;
}

export function useCameraSettings() {
  const { isConnected } = useCamera();

  const settings = useState<ProtoObject>("camera-settings", () => ({}));
  const device = useState<ProtoObject>("camera-device-options", () => ({}));
  const mode = useState<string>("camera-settings-mode", () => "FUNCTION_MODE_NORMAL_VIDEO");
  const loading = useState<boolean>("camera-settings-loading", () => false);
  const saving = useState<string | null>("camera-settings-saving", () => null);
  const error = useState<string | null>("camera-settings-error", () => null);
  const status = useState<Record<string, WriteStatus>>("camera-settings-status", () => ({}));

  const setStatus = (field: string, next: Omit<WriteStatus, "at">) => {
    status.value = { ...status.value, [field]: { ...next, at: Date.now() } };
  };

  async function load() {
    if (!isConnected.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const [photography, options] = await Promise.all([
        readPhotographyOptions(mode.value),
        readDeviceOptions(),
      ]);
      settings.value = photography;
      device.value = options;
      // A fresh read supersedes any per-field verdict from earlier writes
      status.value = {};
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Write, then read the same option straight back and compare.
   *
   * The write response only proves the camera parsed the request. Several
   * settings produce no visible change in the preview, so the read-back is
   * the only honest evidence that anything happened — and when it disagrees,
   * the camera's own value wins and is shown.
   */
  async function update(optionType: string, field: string, value: ProtoValue) {
    const previous = settings.value[field];
    settings.value = { ...settings.value, [field]: value };
    saving.value = field;
    error.value = null;
    try {
      const accepted = await writePhotographyOptions(mode.value, [optionType], { [field]: value });
      if (!accepted.includes(optionType)) {
        settings.value = { ...settings.value, [field]: previous };
        setStatus(field, { outcome: "rejected" });
        error.value = `The camera did not accept ${field}.`;
        return;
      }

      const after = await readPhotographyOption(mode.value, optionType);
      const actual = after[field];
      if (actual === undefined) {
        // proto3 omits defaults, so silence here is genuinely ambiguous
        setStatus(field, { outcome: "assumed" });
        return;
      }
      settings.value = { ...settings.value, [field]: actual };
      setStatus(
        field,
        String(actual) === String(value)
          ? { outcome: "applied" }
          : { outcome: "differs", actual: String(actual) },
      );
    } catch (cause) {
      settings.value = { ...settings.value, [field]: previous };
      setStatus(field, { outcome: "rejected" });
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      saving.value = null;
    }
  }

  watch(mode, () => void load());
  watch(isConnected, (connected) => {
    if (connected) void load();
  });

  return { settings, device, mode, loading, saving, error, status, load, update };
}
