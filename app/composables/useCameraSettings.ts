import type { ProtoObject, ProtoValue } from "~/utils/lunaProto";
import {
  readDeviceOption,
  readDeviceOptions,
  readPhotographyOption,
  readPhotographyOptions,
  writeDeviceOptions,
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

  /**
   * Nested writes like exposure_manual compare as "[object Object]" under
   * String(), which would call every one of them a match. Compare the fields
   * we actually asked for instead, ignoring extras the camera adds.
   */
  const matches = (requested: ProtoValue, actual: ProtoValue): boolean => {
    if (typeof requested === "object" && requested !== null && !Array.isArray(requested)) {
      if (typeof actual !== "object" || actual === null || Array.isArray(actual)) return false;
      const observed = actual as Record<string, ProtoValue | undefined>;
      return Object.entries(requested).every(
        ([key, value]) => value === undefined || String(observed[key]) === String(value),
      );
    }
    return String(requested) === String(actual);
  };

  const describe = (value: ProtoValue): string =>
    typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);

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
        matches(value, actual)
          ? { outcome: "applied" }
          : { outcome: "differs", actual: describe(actual) },
      );
    } catch (cause) {
      settings.value = { ...settings.value, [field]: previous };
      setStatus(field, { outcome: "rejected" });
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      saving.value = null;
    }
  }

  /** The same write-then-verify cycle, for options that live on the device. */
  async function updateDevice(optionType: string, field: string, value: ProtoValue) {
    const previous = device.value[field];
    device.value = { ...device.value, [field]: value };
    saving.value = field;
    error.value = null;
    try {
      const accepted = await writeDeviceOptions([optionType], { [field]: value });
      if (!accepted.includes(optionType)) {
        device.value = { ...device.value, [field]: previous };
        setStatus(field, { outcome: "rejected" });
        error.value = `The camera did not accept ${field}.`;
        return;
      }
      const after = await readDeviceOption(optionType);
      const actual = after[field];
      if (actual === undefined) {
        setStatus(field, { outcome: "assumed" });
        return;
      }
      device.value = { ...device.value, [field]: actual };
      setStatus(
        field,
        matches(value, actual)
          ? { outcome: "applied" }
          : { outcome: "differs", actual: describe(actual) },
      );
    } catch (cause) {
      device.value = { ...device.value, [field]: previous };
      setStatus(field, { outcome: "rejected" });
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      saving.value = null;
    }
  }

  /**
   * Manual ISO and shutter only take effect in manual exposure mode, so set
   * the mode in the same breath rather than leaving the user to discover it.
   */
  async function setManualExposure(patch: { iso?: number; shutter_speed?: string }) {
    const current = (settings.value.exposure_manual as ProtoObject | undefined) ?? {};
    const next: ProtoObject = {
      iso: patch.iso ?? (current.iso as number | undefined),
      shutter_speed: patch.shutter_speed ?? (current.shutter_speed as string | undefined),
    };
    if (settings.value.exposure_mode !== "EXP_MODE_MANUAL") {
      await update("EXPOSURE_MODE", "exposure_mode", "EXP_MODE_MANUAL");
    }
    await update("EXPOSURE_MANUAL", "exposure_manual", next);
  }

  watch(mode, () => void load());
  watch(isConnected, (connected) => {
    if (connected) void load();
  });

  return {
    settings,
    device,
    mode,
    loading,
    saving,
    error,
    status,
    load,
    update,
    updateDevice,
    setManualExposure,
  };
}
