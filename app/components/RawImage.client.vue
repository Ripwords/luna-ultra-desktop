<script setup lang="ts">
import { cameraFetch } from "~/utils/lunaClient";
import { extractDngPreview } from "~/utils/dng";
import { parseRawImageMeta, decodeRawPreview } from "~/utils/rawPreview";
import { formatBytes } from "~/utils/media";
import { withCameraSlot, CAMERA_PRIORITY } from "~/utils/cameraQueue";

/**
 * Shows a RAW (e.g. DNG) file. Prefers an embedded preview JPEG; when the file
 * has none (the Luna's DNGs are raw Bayer only) and we hold the whole file, it
 * decodes the sensor data into a preview. For grid thumbnails pass `maxBytes`
 * to range-fetch only the start of the file (cheap) — those never raw-decode.
 * Falls back to the `fallback` slot when no preview can be produced.
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
const imgSrc = ref<string | null>(null);
const state = ref<"idle" | "loading" | "loaded" | "nopreview" | "error">("idle");
const phase = ref<"downloading" | "decoding">("downloading");
const downloaded = ref(0);
const total = ref(0);

/** Whether this instance shows the full file (full-screen), not a grid thumb. */
const fullFile = computed(() => !props.maxBytes);
const percent = computed(() => (total.value ? Math.round((downloaded.value / total.value) * 100) : 0));

let observer: IntersectionObserver | null = null;

/**
 * Download the response body, reporting byte progress as it streams so a large
 * RAW (tens of MB over the camera's Wi-Fi) shows movement instead of an opaque
 * spinner. Falls back to a plain buffered read when the body isn't streamable.
 */
async function downloadBuffer(response: Response): Promise<ArrayBuffer> {
  total.value = Number(response.headers.get("content-length") ?? 0);
  const body = response.body;
  if (!body) return await response.arrayBuffer();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      downloaded.value = received;
    }
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

/**
 * Render an uncompressed CFA RAW (e.g. Insta360 Luna DNG) to a preview JPEG
 * data URL via canvas. Synchronous encode (toDataURL) is used deliberately: it
 * can't leave us waiting on a canvas.toBlob callback that never fires. Returns
 * null when the file isn't a supported raw or the canvas is unavailable.
 */
function decodeRawToDataUrl(buffer: ArrayBuffer): string | null {
  const meta = parseRawImageMeta(buffer);
  if (!meta) return null;
  const decoded = decodeRawPreview(buffer, meta, 1600);
  if (!decoded) return null;
  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(decoded.data, decoded.width, decoded.height), 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function load() {
  if (state.value !== "idle") return;
  state.value = "loading";
  phase.value = "downloading";
  // Full-screen preview outranks grid thumbnails for the shared camera slots.
  const priority = props.maxBytes ? CAMERA_PRIORITY.THUMBNAIL : CAMERA_PRIORITY.PREVIEW;
  try {
    // Hold one camera slot for the entire download (fetch + streamed read); the
    // CPU-bound decode below runs after the slot is released.
    const buffer = await withCameraSlot(async () => {
      const init: RequestInit = props.maxBytes ? { headers: { Range: `bytes=0-${props.maxBytes - 1}` } } : {};
      const response = await cameraFetch(props.src, init);
      if (!response.ok) throw new Error(String(response.status));
      // If we asked for a byte range (grid thumbnail) but the camera ignored it
      // and would send the whole multi-MB file, skip rather than download it.
      if (props.maxBytes && response.status !== 206) {
        const len = Number(response.headers.get("content-length") ?? 0);
        if (len === 0 || len > props.maxBytes * 2) return null;
      }
      return await downloadBuffer(response);
    }, priority);

    if (buffer === null) {
      state.value = "nopreview";
      return;
    }

    // Fast path: an embedded preview JPEG (many RAW formats carry one).
    const embedded = extractDngPreview(buffer, props.prefer);
    if (embedded) {
      imgSrc.value = URL.createObjectURL(embedded);
      state.value = "loaded";
      return;
    }

    // No embedded JPEG: if we hold the whole file (full-screen view, not a grid
    // range-fetch), decode the raw Bayer sensor data into a preview.
    if (fullFile.value) {
      phase.value = "decoding";
      await nextTick(); // let the "Rendering preview…" state paint before the sync decode
      const url = decodeRawToDataUrl(buffer);
      if (url) {
        imgSrc.value = url;
        state.value = "loaded";
        return;
      }
    }

    state.value = "nopreview";
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
  // Only object URLs need revoking; data URLs (raw decode output) don't.
  if (imgSrc.value?.startsWith("blob:")) URL.revokeObjectURL(imgSrc.value);
});
</script>

<template>
  <div ref="el" class="relative size-full">
    <img v-if="state === 'loaded' && imgSrc" :src="imgSrc" alt="" draggable="false" :class="imgClass" />

    <slot v-else-if="state === 'nopreview' || state === 'error'" name="fallback" :ext="ext">
      <div class="flex size-full flex-col items-center justify-center gap-1.5 bg-elevated text-dimmed">
        <UIcon name="i-lucide-aperture" class="size-6" />
        <span class="font-mono text-[10px] uppercase tracking-wide">{{ ext }}</span>
      </div>
    </slot>

    <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-elevated text-dimmed">
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
      <p v-if="fullFile" class="text-center text-xs">
        <template v-if="phase === 'downloading'">
          Downloading RAW… {{ total ? `${percent}%` : formatBytes(downloaded) }}
        </template>
        <template v-else>Rendering preview…</template>
      </p>
    </div>
  </div>
</template>
