<script setup lang="ts">
import { cameraFetch } from "~/utils/lunaClient";
import { videoMimeFor } from "~/utils/media";
import { withCameraSlot, CAMERA_PRIORITY } from "~/utils/cameraQueue";

/**
 * Video thumbnail: a <video> seeked to its first frame. The camera's plain-HTTP
 * host can't be used as a direct <video src> in the packaged app (same reason
 * photos go through the Tauri HTTP bridge), and seeking over the network stalls
 * silently on WebKit — the tile stays grey forever. So we pull the thumbnail
 * source through the bridge and seek a *local* blob, which is reliable.
 *
 * Sources are tried in order: the small LRV proxy (cheap), then a bounded
 * prefix of the full file. If none yields a frame we show a placeholder rather
 * than download a multi-hundred-MB video for a thumbnail.
 */
const props = withDefaults(
  defineProps<{
    /** Full-resolution source (the file that also plays back) */
    src: string;
    /** Optional low-res proxy to try first */
    lrv?: string;
    imgClass?: string;
    eager?: boolean;
  }>(),
  { imgClass: "", eager: false },
);

const el = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const objectUrl = ref<string | null>(null);
const state = ref<"idle" | "loading" | "loaded" | "error">("idle");

let observer: IntersectionObserver | null = null;
let stallTimer: ReturnType<typeof setTimeout> | null = null;
let controller: AbortController | null = null;
let attempt = 0;

/**
 * Ordered thumbnail sources: small proxy first, then a bounded prefix of the
 * full file. Every source is byte-bounded so a single thumbnail can't hold a
 * shared camera slot for long. A fast-start MP4/LRV carries its moov + first
 * frame near the head; these sizes are device-tunable.
 */
const sources = computed(() => {
  const list: Array<{ url: string; maxBytes: number }> = [];
  if (props.lrv && props.lrv !== props.src) list.push({ url: props.lrv, maxBytes: 6_000_000 });
  list.push({ url: props.src, maxBytes: 3_000_000 });
  return list;
});

function clearStall() {
  if (stallTimer) {
    clearTimeout(stallTimer);
    stallTimer = null;
  }
}

function armStall() {
  clearStall();
  // Covers fetch + decode; if nothing rendered, abort (freeing the camera slot)
  // and move to the next source.
  stallTimer = setTimeout(() => {
    if (state.value !== "loaded") nextAttempt();
  }, 12_000);
}

function revoke() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = null;
  }
}

async function tryAttempt() {
  const source = sources.value[attempt];
  if (!source) {
    revoke();
    clearStall();
    state.value = "error";
    return;
  }
  const token = attempt;
  const signal = controller?.signal;
  armStall();
  try {
    // Thumbnails share the limited camera slots at the lowest priority so they
    // never starve an opened preview or the photo tiles.
    const blob = await withCameraSlot(async () => {
      const response = await cameraFetch(source.url, {
        headers: { Range: `bytes=0-${source.maxBytes - 1}` },
        signal,
      });
      if (!response.ok && response.status !== 206) throw new Error(String(response.status));
      const raw = await response.blob();
      const mime = videoMimeFor(source.url);
      return mime && raw.type !== mime ? new Blob([raw], { type: mime }) : raw;
    }, CAMERA_PRIORITY.THUMBNAIL);
    if (token !== attempt) return; // superseded by a newer attempt
    revoke();
    objectUrl.value = URL.createObjectURL(blob);
  } catch {
    if (token === attempt) nextAttempt();
  }
}

function nextAttempt() {
  controller?.abort(); // free the camera slot if the previous fetch is still running
  controller = new AbortController();
  attempt++;
  state.value = "loading";
  void tryAttempt();
}

function begin() {
  if (state.value !== "idle") return;
  state.value = "loading";
  attempt = 0;
  controller = new AbortController();
  void tryAttempt();
}

function onMeta() {
  const v = video.value;
  if (!v) return;
  // Seek a hair off zero — the very first frame is often black.
  try {
    v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
  } catch {
    // Seeking unsupported: the loadeddata frame will have to do.
  }
}

function onReady() {
  clearStall();
  state.value = "loaded";
}

function onError() {
  nextAttempt();
}

onMounted(async () => {
  await nextTick();
  if (props.eager || !("IntersectionObserver" in window) || !el.value) {
    begin();
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect();
        begin();
      }
    },
    { rootMargin: "300px" },
  );
  observer.observe(el.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  clearStall();
  controller?.abort();
  revoke();
});
</script>

<template>
  <div ref="el" class="relative size-full">
    <video
      v-if="objectUrl"
      ref="video"
      :key="objectUrl"
      :src="objectUrl"
      muted
      playsinline
      preload="metadata"
      :class="[imgClass, state === 'loaded' ? '' : 'invisible']"
      @loadedmetadata="onMeta"
      @seeked="onReady"
      @loadeddata="onReady"
      @error="onError"
    />
    <div v-if="state !== 'loaded'" class="absolute inset-0 flex items-center justify-center bg-elevated">
      <UIcon v-if="state === 'error'" name="i-lucide-film" class="size-5 text-dimmed" />
      <UIcon v-else name="i-lucide-loader-circle" class="size-5 animate-spin text-dimmed" />
    </div>
  </div>
</template>
