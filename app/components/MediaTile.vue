<script setup lang="ts">
import type { MediaItem } from "~/types/media";

const props = defineProps<{
  item: MediaItem;
  selected: boolean;
  selectionActive: boolean;
}>();

const emit = defineEmits<{
  open: [];
  select: [event: MouseEvent];
  loaded: [dimensions: { width: number; height: number }];
}>();

function onTileClick(event: MouseEvent) {
  if (props.selectionActive || event.shiftKey) emit("select", event);
  else emit("open");
}
</script>

<template>
  <div
    class="group relative aspect-square cursor-pointer select-none overflow-hidden rounded-lg bg-muted outline-none transition focus-visible:ring-2 focus-visible:ring-primary"
    :class="selected ? 'ring-2 ring-primary' : ''"
    role="button"
    tabindex="0"
    :aria-label="`${item.name}${selected ? ', selected' : ''}`"
    :aria-pressed="selectionActive ? selected : undefined"
    @click="onTileClick"
    @keydown.enter.prevent="emit('open')"
    @keydown.space.prevent="emit('select', $event as unknown as MouseEvent)"
  >
    <VideoThumb
      v-if="item.type === 'video'"
      :src="item.srcUrl"
      :lrv="item.lrvUrl"
      img-class="size-full object-cover transition-transform duration-300"
      :class="selected ? 'scale-[0.88] rounded-md' : 'group-hover:scale-[1.03]'"
    />
    <CameraImage
      v-else-if="item.renderable"
      :src="item.srcUrl"
      :alt="item.name"
      img-class="size-full object-cover transition-transform duration-300"
      :class="selected ? 'scale-[0.88] rounded-md' : 'group-hover:scale-[1.03]'"
      @loaded="emit('loaded', $event)"
    />
    <!-- RAW with a sibling JPG (RAW+JPEG pair): show the JPG as its thumbnail -->
    <CameraImage
      v-else-if="item.previewUrl"
      :src="item.previewUrl"
      :alt="item.name"
      img-class="size-full object-cover transition-transform duration-300"
      :class="selected ? 'scale-[0.88] rounded-md' : 'group-hover:scale-[1.03]'"
    />
    <RawImage
      v-else
      :src="item.srcUrl"
      :ext="item.ext"
      prefer="smallest"
      :max-bytes="2_000_000"
      img-class="size-full object-cover transition-transform duration-300"
      :class="selected ? 'scale-[0.88] rounded-md' : 'group-hover:scale-[1.03]'"
    />

    <button
      type="button"
      class="absolute left-2 top-2 flex size-6 cursor-pointer items-center justify-center rounded-full border transition"
      :class="
        selected
          ? 'border-transparent bg-primary text-inverted opacity-100'
          : 'border-white/80 bg-black/25 text-white opacity-0 backdrop-blur-sm hover:bg-black/50 focus-visible:opacity-100 group-hover:opacity-100'
      "
      :aria-label="selected ? `Deselect ${item.name}` : `Select ${item.name}`"
      @click.stop="emit('select', $event)"
    >
      <UIcon name="i-lucide-check" class="size-3.5" />
    </button>

    <span
      v-if="item.type === 'video'"
      class="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white backdrop-blur-sm"
    >
      <UIcon name="i-lucide-play" class="size-3" />
      <span v-if="item.duration != null">{{ formatDuration(item.duration) }}</span>
    </span>

    <span
      v-if="item.type === 'photo' && !item.renderable && item.previewUrl"
      class="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] uppercase text-white backdrop-blur-sm"
    >
      {{ item.ext }}
    </span>

    <span
      v-else-if="item.panoramic"
      class="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur-sm"
    >
      <UIcon name="i-lucide-globe" class="size-3" />
      360
    </span>
  </div>
</template>
