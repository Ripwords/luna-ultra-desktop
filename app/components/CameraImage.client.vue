<script setup lang="ts">
import { cameraFetch } from "~/utils/lunaClient";

/**
 * Loads a camera image through the Tauri HTTP plugin (the camera's plain-HTTP
 * host can't be used as a direct <img src> from the packaged app), converts it
 * to an object URL, and only fetches once it scrolls near the viewport.
 */
const props = withDefaults(
  defineProps<{
    src: string;
    alt: string;
    imgClass?: string;
    eager?: boolean;
  }>(),
  { imgClass: "", eager: false },
);

const el = ref<HTMLElement | null>(null);
const objectUrl = ref<string | null>(null);
const state = ref<"idle" | "loading" | "loaded" | "error">("idle");

let observer: IntersectionObserver | null = null;

function isVideoSource(url: string, blobType: string): boolean {
  if (blobType.startsWith("video/")) return true;
  return /\.(lrv|mp4|mov)$/.test(url.split("?")[0]!.toLowerCase());
}

/** Decode the first frame of a video blob (e.g. an LRV proxy) into a JPEG. */
async function extractPosterFrame(blob: Blob): Promise<Blob> {
  const videoUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("undecodable video")), { once: true });
    });
    // Some decoders only paint after an explicit seek off frame zero
    video.currentTime = Math.min(0.1, video.duration || 0.1);
    await new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const poster = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!poster) throw new Error("frame capture failed");
    return poster;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(videoUrl);
  }
}

async function load() {
  if (state.value !== "idle") return;
  state.value = "loading";
  try {
    const response = await cameraFetch(props.src);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const display = isVideoSource(props.src, blob.type) ? await extractPosterFrame(blob) : blob;
    objectUrl.value = URL.createObjectURL(display);
    state.value = "loaded";
  } catch {
    state.value = "error";
  }
}

onMounted(async () => {
  // .client components mount a tick late; wait for the template ref to bind
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
    <img
      v-if="state === 'loaded' && objectUrl"
      :src="objectUrl"
      :alt="alt"
      draggable="false"
      :class="imgClass"
    />
    <div
      v-else
      class="flex size-full items-center justify-center bg-elevated"
      :aria-busy="state === 'loading'"
    >
      <UIcon
        v-if="state === 'error'"
        name="i-lucide-image-off"
        class="size-5 text-dimmed"
      />
      <UIcon
        v-else
        name="i-lucide-loader-circle"
        class="size-5 animate-spin text-dimmed"
      />
    </div>
  </div>
</template>
