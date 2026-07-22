import type { ProtoObject, ProtoValue } from "~/utils/lunaProto";
import {
  readDeviceOptions,
  readPhotographyOptions,
  writePhotographyOptions,
} from "~/utils/lunaSettings";

export function useCameraSettings() {
  const { isConnected } = useCamera();

  const settings = useState<ProtoObject>("camera-settings", () => ({}));
  const device = useState<ProtoObject>("camera-device-options", () => ({}));
  const mode = useState<string>("camera-settings-mode", () => "FUNCTION_MODE_NORMAL_VIDEO");
  const loading = useState<boolean>("camera-settings-loading", () => false);
  const saving = useState<string | null>("camera-settings-saving", () => null);
  const error = useState<string | null>("camera-settings-error", () => null);

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
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Optimistically apply, then reconcile against what the camera confirms.
   * A setting the camera silently ignores must snap back rather than lie.
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
        error.value = `The camera did not accept ${field}.`;
      }
    } catch (cause) {
      settings.value = { ...settings.value, [field]: previous };
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      saving.value = null;
    }
  }

  watch(mode, () => void load());
  watch(isConnected, (connected) => {
    if (connected) void load();
  });

  return { settings, device, mode, loading, saving, error, load, update };
}
