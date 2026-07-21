<script setup lang="ts">
import { cameraFetch } from "~/utils/lunaClient";
import { videoMimeFor } from "~/utils/media";

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
let attempt = 0;

/** Ordered thumbnail sources: small proxy first, then a bounded prefix. */
const sources = computed(() => {
  const list: Array<{ url: string; maxBytes?: number }> = [];
  if (props.lrv && props.lrv !== props.src) list.push({ url: props.lrv });
  // Only a prefix of the full file — enough for a fast-start MP4's first frame,
  // without pulling the whole clip.
  list.push({ url: props.src, maxBytes: 8_000_000 });
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
  // Covers fetch + decode; if nothing rendered, move to the next source.
  stallTimer = setTimeout(() => {
    if (state.value !== "loaded") nextAttempt();
  }, 20_000);
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
  armStall();
  try {
    const init: RequestInit | undefined = source.maxBytes
      ? { headers: { Range: `bytes=0-${source.maxBytes - 1}` } }
      : undefined;
    const response = await cameraFetch(source.url, init);
    if (!response.ok && response.status !== 206) throw new Error(String(response.status));
    let blob = await response.blob();
    const mime = videoMimeFor(source.url);
    if (mime && blob.type !== mime) blob = new Blob([blob], { type: mime });
    if (token !== attempt) return; // superseded by a newer attempt
    revoke();
    objectUrl.value = URL.createObjectURL(blob);
  } catch {
    if (token === attempt) nextAttempt();
  }
}

function nextAttempt() {
  attempt++;
  state.value = "loading";
  void tryAttempt();
}

function begin() {
  if (state.value !== "idle") return;
  state.value = "loading";
  attempt = 0;
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
