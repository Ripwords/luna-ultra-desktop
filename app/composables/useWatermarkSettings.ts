import { DEFAULT_WATERMARK, WATERMARK_POSITIONS, type WatermarkSettings } from "~/utils/watermark";

const STORAGE_KEY = "luna-watermark-settings-v2";

export function useWatermarkSettings() {
  const settings = useState<WatermarkSettings>("watermark-settings", () => {
    if (import.meta.client) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<WatermarkSettings>;
          if (parsed.position && WATERMARK_POSITIONS.includes(parsed.position)) {
            return { ...DEFAULT_WATERMARK, ...parsed };
          }
        }
      } catch {
        // fall through to defaults
      }
    }
    return { ...DEFAULT_WATERMARK };
  });

  if (import.meta.client) {
    watch(
      settings,
      (value) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      },
      { deep: true },
    );
  }

  function reset() {
    settings.value = { ...DEFAULT_WATERMARK };
  }

  return { settings, reset };
}
