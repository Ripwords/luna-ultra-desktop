<script setup lang="ts">
/**
 * Video thumbnail: a real <video> element seeked to its first frame, rather
 * than fetching the whole file and painting a canvas (which is fragile in
 * WebKit and can produce black frames). Streams via HTTP range, works
 * cross-origin (we only display, never read pixels), and falls back from the
 * low-res LRV proxy to the full file if the proxy can't be decoded.
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
const activeSrc = ref<string | null>(null);
const state = ref<"idle" | "loading" | "loaded" | "error">("idle");

let observer: IntersectionObserver | null = null;
let triedFallback = false;

function begin() {
  if (state.value !== "idle") return;
  state.value = "loading";
  activeSrc.value = props.lrv || props.src;
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
  state.value = "loaded";
}

function onError() {
  // If the proxy failed, retry once with the full-resolution file.
  if (!triedFallback && props.lrv && props.lrv !== props.src) {
    triedFallback = true;
    activeSrc.value = props.src;
    return;
  }
  state.value = "error";
}

onMounted(async () => {
  // .client components bind their template ref a tick late
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

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="el" class="relative size-full">
    <video
      v-if="activeSrc"
      ref="video"
      :key="activeSrc"
      :src="activeSrc"
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
