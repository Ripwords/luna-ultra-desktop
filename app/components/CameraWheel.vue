<script setup lang="ts">
import type { WheelStep } from "~/utils/cameraLabels";

/**
 * A horizontal value picker, modelled on the shutter wheel in the phone app.
 * Discrete steps rather than a slider, because every setting behind it is an
 * enum or a fixed stop.
 */
const props = defineProps<{
  steps: WheelStep[];
  modelValue: string | undefined;
  busy?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const track = ref<HTMLElement | null>(null);

/** Keep the chosen step in view when it changes from outside, e.g. a reload. */
watch(
  () => props.modelValue,
  async (value) => {
    if (!value) return;
    await nextTick();
    track.value
      ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="track"
    class="flex snap-x snap-mandatory gap-1 overflow-x-auto pb-2"
    :class="busy ? 'pointer-events-none opacity-60' : ''"
  >
    <button
      v-for="step in steps"
      :key="step.value"
      :data-value="step.value"
      type="button"
      class="shrink-0 snap-center rounded-md px-3 py-1.5 text-sm transition-colors"
      :class="
        step.value === modelValue
          ? 'bg-primary font-medium text-inverted'
          : 'text-muted hover:bg-elevated'
      "
      @click="emit('update:modelValue', step.value)"
    >
      {{ step.label }}
    </button>
  </div>
</template>
