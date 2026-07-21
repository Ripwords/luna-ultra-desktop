<script setup lang="ts">
import { cameraFetch } from "~/utils/lunaClient";
import { extractDngPreview } from "~/utils/dng";

/**
 * Shows a RAW (e.g. DNG) file by extracting its embedded preview JPEG. For
 * grid thumbnails pass `maxBytes` to range-fetch only the start of the file
 * (cheap); for the full-screen view fetch the whole file and prefer the
 * largest preview. Falls back to the `fallback` slot when no preview exists.
 */
const props = withDefaults(
  defineProps<{
    src: string;
    ext: string;
    imgClass?: string;
    eager?: boolean;
    prefer?: "largest" | "smallest";
    /** Range-limit the download; the preview must fall within these bytes */
    maxBytes?: number;
  }>(),
  { imgClass: "", eager: false, prefer: "largest" },
);

const el = ref<HTMLElement | null>(null);
const objectUrl = ref<string | null>(null);
const state = ref<"idle" | "loading" | "loaded" | "nopreview" | "error">("idle");

let observer: IntersectionObserver | null = null;

async function load() {
  if (state.value !== "idle") return;
  state.value = "loading";
  try {
    const init: RequestInit = props.maxBytes ? { headers: { Range: `bytes=0-${props.maxBytes - 1}` } } : {};
    const response = await cameraFetch(props.src, init);
    if (!response.ok) throw new Error(String(response.status));
    // If we asked for a byte range (grid thumbnail) but the camera ignored it
    // and would send the whole multi-MB file, skip rather than download it.
    if (props.maxBytes && response.status !== 206) {
      const len = Number(response.headers.get("content-length") ?? 0);
      if (len === 0 || len > props.maxBytes * 2) {
        state.value = "nopreview";
        return;
      }
    }
    const buffer = await response.arrayBuffer();
    const blob = extractDngPreview(buffer, props.prefer);
    if (!blob) {
      state.value = "nopreview";
      return;
    }
    objectUrl.value = URL.createObjectURL(blob);
    state.value = "loaded";
  } catch {
    state.value = "error";
  }
}

onMounted(async () => {
  await nextTick();
  if (props.eager || !("IntersectionObserver" in window) || !el.value) {
    void load();
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect();
        void load();
      }
    },
    { rootMargin: "300px" },
  );
  observer.observe(el.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
});
</script>

<template>
  <div ref="el" class="relative size-full">
    <img v-if="state === 'loaded' && objectUrl" :src="objectUrl" alt="" draggable="false" :class="imgClass" />

    <slot v-else-if="state === 'nopreview' || state === 'error'" name="fallback" :ext="ext">
      <div class="flex size-full flex-col items-center justify-center gap-1.5 bg-elevated text-dimmed">
        <UIcon name="i-lucide-aperture" class="size-6" />
        <span class="font-mono text-[10px] uppercase tracking-wide">{{ ext }}</span>
      </div>
    </slot>

    <div v-else class="absolute inset-0 flex items-center justify-center bg-elevated">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-dimmed" />
    </div>
  </div>
</template>
