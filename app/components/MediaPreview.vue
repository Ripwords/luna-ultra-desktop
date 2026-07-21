<script setup lang="ts">
import type { MediaItem } from "~/types/media";
import { formatBytes, formatDuration } from "~/utils/media";

const props = defineProps<{
  item: MediaItem | null;
  hasPrev: boolean;
  hasNext: boolean;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  prev: [];
  next: [];
  download: [];
  delete: [];
}>();

const takenLabel = computed(() => {
  if (!props.item) return "";
  return new Date(props.item.takenAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
});

defineShortcuts({
  arrowleft: () => {
    if (open.value) emit("prev");
  },
  arrowright: () => {
    if (open.value) emit("next");
  },
});
</script>

<template>
  <UModal v-model:open="open" fullscreen :ui="{ content: 'bg-default', body: 'p-0 sm:p-0' }" :title="item?.name ?? 'Preview'" :description="takenLabel">
    <template #content>
      <div v-if="item" class="flex h-full flex-col">
        <div class="flex items-center justify-between gap-4 border-b border-default px-4 py-2.5">
          <div class="min-w-0">
            <p class="truncate font-mono text-sm text-highlighted">{{ item.name }}</p>
            <p class="text-xs text-muted">{{ takenLabel }}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <UButton icon="i-lucide-arrow-down-to-line" label="Download" size="sm" color="neutral" variant="outline" @click="emit('download')" />
            <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" aria-label="Delete file" @click="emit('delete')" />
            <UButton icon="i-lucide-x" size="sm" color="neutral" variant="ghost" aria-label="Close preview" @click="open = false" />
          </div>
        </div>

        <div class="relative flex min-h-0 flex-1 items-center justify-center bg-black/95 dark:bg-black">
          <!-- Play the low-res LRV proxy when available; the full-res file can
               be hundreds of MB and is meant for download, not preview. -->
          <video
            v-if="item.type === 'video'"
            :key="item.id"
            :src="item.lrvUrl ?? item.srcUrl"
            controls
            playsinline
            class="max-h-full max-w-full"
          />
          <CameraImage
            v-else
            :key="item.id"
            :src="item.srcUrl"
            :alt="item.name"
            eager
            img-class="max-h-full max-w-full object-contain"
          />

          <UButton
            v-if="hasPrev"
            icon="i-lucide-chevron-left"
            size="lg"
            color="neutral"
            variant="solid"
            class="absolute left-4 top-1/2 -translate-y-1/2"
            aria-label="Previous file"
            @click="emit('prev')"
          />
          <UButton
            v-if="hasNext"
            icon="i-lucide-chevron-right"
            size="lg"
            color="neutral"
            variant="solid"
            class="absolute right-4 top-1/2 -translate-y-1/2"
            aria-label="Next file"
            @click="emit('next')"
          />
        </div>

        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-default px-4 py-2.5 font-mono text-xs text-muted">
          <span v-if="item.width && item.height">{{ item.width }} × {{ item.height }}</span>
          <span v-if="item.size > 0">{{ formatBytes(item.size) }}</span>
          <span class="uppercase">{{ item.type }}</span>
          <span v-if="item.duration != null">{{ formatDuration(item.duration) }}</span>
        </div>
      </div>
    </template>
  </UModal>
</template>
