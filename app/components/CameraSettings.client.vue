<script setup lang="ts">
import { enumNames } from "~/utils/lunaProto";

const { settings, device, mode, loading, saving, error, load, update } = useCameraSettings();

/** Each control names the option type the camera expects for that field. */
const pickers = [
  {
    label: "Exposure mode",
    field: "exposure_mode",
    option: "EXPOSURE_MODE",
    values: "insta360.messages.PhotographyOptions.ExposureMode",
  },
  {
    label: "White balance",
    field: "white_balance",
    option: "WHITE_BALANCE",
    values: "insta360.messages.PhotographyOptions.WhiteBalance",
  },
  {
    label: "Colour mode",
    field: "color_mode",
    option: "COLOR_MODE",
    values: "insta360.messages.PhotographyOptions.COLOR_MODE",
  },
  {
    label: "Gamma",
    field: "gamma_mode",
    option: "VIDEO_GAMMA_MODE",
    values: "insta360.messages.GammaMode",
  },
  {
    label: "Field of view",
    field: "fov_type",
    option: "FOV_TYPE",
    values: "insta360.messages.PhotographyOptions.Fov_Type",
  },
  {
    label: "Flicker",
    field: "flicker",
    option: "FLICKER",
    values: "insta360.messages.Flicker",
  },
];

const sliders = [
  { label: "EV bias", field: "exposure_bias", option: "EXPOSURE_BIAS", min: -4, max: 4, step: 1 },
  { label: "Zoom", field: "zoom_scale", option: "ZOOM_SCALE", min: 1, max: 12, step: 0.5 },
  { label: "Sharpness", field: "sharpness", option: "SHARPNESS", min: 0, max: 4, step: 1 },
  {
    label: "ISO ceiling",
    field: "video_iso_top_limit",
    option: "VIDEO_ISO_TOP_LIMIT",
    min: 0,
    max: 6400,
    step: 100,
  },
];

const options = (name: string) => enumNames(name).map((value) => ({ label: value, value }));

/**
 * Before the first read we know nothing, so enable everything rather than
 * greying out controls that may well work.
 */
const supported = computed(() => new Set((settings.value.$supported as string[] | undefined) ?? []));
const isSupported = (option: string) => supported.value.size === 0 || supported.value.has(option);

const battery = computed(() => {
  const status = device.value.battery_status as Record<string, unknown> | undefined;
  return typeof status?.battery_level === "number" ? status.battery_level : null;
});

const storage = computed(() => {
  const state = device.value.storage_state as Record<string, unknown> | undefined;
  if (typeof state?.free_space !== "number" || typeof state?.total_space !== "number") return null;
  return { free: state.free_space / 1e9, total: state.total_space / 1e9 };
});

const modes = [
  { label: "Video", value: "FUNCTION_MODE_NORMAL_VIDEO" },
  { label: "Photo", value: "FUNCTION_MODE_NORMAL_IMAGE" },
];

const numberOf = (field: string, fallback: number) =>
  typeof settings.value[field] === "number" ? (settings.value[field] as number) : fallback;

/**
 * Enums decode to their name, but a value the schema does not cover decodes
 * to its number — the select still needs a string either way.
 */
const stringOf = (field: string): string | undefined => {
  const value = settings.value[field];
  return value === undefined ? undefined : String(value);
};

onMounted(() => void load());
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <USelect v-model="mode" :items="modes" class="w-40" />
      <UButton
        label="Reload"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="loading"
        @click="load"
      />
      <div class="ml-auto flex flex-wrap items-center gap-4 text-sm text-muted">
        <span v-if="battery !== null">
          <UIcon name="i-lucide-battery" class="mr-1 align-middle" />{{ battery }}%
        </span>
        <span v-if="storage">
          <UIcon name="i-lucide-hard-drive" class="mr-1 align-middle" />
          {{ storage.free.toFixed(1) }} / {{ storage.total.toFixed(0) }} GB
        </span>
        <span v-if="device.firmwareRevision">fw {{ device.firmwareRevision }}</span>
      </div>
    </div>

    <UAlert
      v-if="error"
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
      :title="error"
    />

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField v-for="picker in pickers" :key="picker.field" :label="picker.label">
        <USelect
          :model-value="stringOf(picker.field)"
          :items="options(picker.values)"
          :disabled="!isSupported(picker.option) || saving === picker.field"
          :loading="saving === picker.field"
          class="w-full"
          @update:model-value="(value: string) => update(picker.option, picker.field, value)"
        />
      </UFormField>
    </div>

    <div class="grid gap-6 sm:grid-cols-2">
      <UFormField
        v-for="slider in sliders"
        :key="slider.field"
        :label="`${slider.label}: ${settings[slider.field] ?? 0}`"
      >
        <USlider
          :model-value="numberOf(slider.field, slider.min)"
          :min="slider.min"
          :max="slider.max"
          :step="slider.step"
          :disabled="!isSupported(slider.option) || saving === slider.field"
          @update:model-value="
            (value: number | undefined) =>
              value === undefined ? undefined : update(slider.option, slider.field, value)
          "
        />
      </UFormField>
    </div>

    <details class="text-sm">
      <summary class="cursor-pointer text-muted">Everything the camera reported</summary>
      <pre class="mt-2 max-h-96 overflow-auto rounded bg-elevated p-3 text-xs">{{
        JSON.stringify({ photography: settings, device }, null, 2)
      }}</pre>
    </details>
  </div>
</template>
