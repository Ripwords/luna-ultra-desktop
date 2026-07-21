<script setup lang="ts">
import { cameraFetch } from "~/utils/lunaClient";
import { imageMimeFor } from "~/utils/media";

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

async function load() {
  if (state.value !== "idle") return;
  state.value = "loading";
  try {
    const response = await cameraFetch(props.src);
    if (!response.ok) throw new Error(String(response.status));
    let blob = await response.blob();
    // The camera may serve images as octet-stream; force the right MIME so
    // the browser renders the blob (fixes .insp and mistyped JPEGs).
    const mime = imageMimeFor(props.src);
    if (mime && blob.type !== mime) blob = new Blob([blob], { type: mime });
    objectUrl.value = URL.createObjectURL(blob);
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
