<script setup lang="ts">
import type { MediaItem } from "~/types/media";
import { WATERMARK_POSITIONS, type WatermarkPosition } from "~/utils/watermark";

const props = defineProps<{ items: MediaItem[] }>();

const emit = defineEmits<{ close: [confirmed: boolean] }>();

const { settings } = useWatermarkSettings();

const photos = computed(() => props.items.filter((item) => item.type === "photo"));
const videos = computed(() => props.items.filter((item) => item.type === "video"));
const previewSrc = computed(() => photos.value[0]?.srcUrl);

const positionLabels: Record<WatermarkPosition, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-center": "Bottom center",
  "bottom-right": "Bottom right",
};

const anchorClasses: Record<WatermarkPosition, string> = {
  "top-left": "left-2 top-2",
  "top-right": "right-2 top-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-center": "bottom-2 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-2 right-2",
};

const summary = computed(() => {
  const parts: string[] = [];
  if (photos.value.length > 0) parts.push(`${photos.value.length} ${photos.value.length === 1 ? "photo" : "photos"}`);
  if (videos.value.length > 0) parts.push(`${videos.value.length} ${videos.value.length === 1 ? "video" : "videos"}`);
  return parts.join(" and ");
});
</script>

<template>
  <UModal
    :close="{ onClick: () => emit('close', false) }"
    :title="`Download ${summary}`"
    description="Files save to the Luna Ultra folder in Downloads."
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-5">
        <template v-if="photos.length > 0">
          <USwitch
            v-model="settings.enabled"
            label="Apply Luna Ultra watermark"
            description="The official watermark is rendered into photos. Videos transfer untouched."
          />

          <div v-if="settings.enabled" class="grid grid-cols-[1fr_auto] items-start gap-4">
            <WatermarkCanvas :src="previewSrc" />
            <UFormField label="Position" :help="positionLabels[settings.position]">
              <div class="relative h-20 w-32 rounded-lg border border-default bg-muted">
                <button
                  v-for="position in WATERMARK_POSITIONS"
                  :key="position"
                  type="button"
                  class="absolute flex size-6 cursor-pointer items-center justify-center rounded-md border transition"
                  :class="[
                    anchorClasses[position],
                    settings.position === position
                      ? 'border-transparent bg-primary text-inverted'
                      : 'border-default bg-elevated text-muted hover:border-accented hover:text-default',
                  ]"
                  :aria-label="positionLabels[position]"
                  :aria-pressed="settings.position === position"
                  @click="settings.position = position"
                >
                  <span class="block size-1.5 rounded-[2px] bg-current" />
                </button>
              </div>
            </UFormField>
          </div>
        </template>

        <p v-else class="text-sm text-muted">
          Videos transfer untouched. Watermarking currently applies to photos only.
        </p>
      </div>
    </template>

    <template #footer>
      <UButton label="Cancel" color="neutral" variant="outline" @click="emit('close', false)" />
      <UButton
        :label="items.length === 1 ? 'Download' : `Download ${items.length} files`"
        icon="i-lucide-arrow-down-to-line"
        @click="emit('close', true)"
      />
    </template>
  </UModal>
</template>
