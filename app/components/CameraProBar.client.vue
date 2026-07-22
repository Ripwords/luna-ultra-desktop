<script setup lang="ts">
import { isoLabel, isoSteps, shutterLabel, shutterSteps } from "~/utils/cameraLabels";
import { enumNames } from "~/utils/lunaProto";
import type { ProtoObject } from "~/utils/lunaProto";

/**
 * The Pro row from the phone app: a strip of chips showing each setting's
 * current value, one of which expands into a wheel. Only one wheel is open at
 * a time, which is what keeps the row readable on a narrow window.
 */
const { settings, saving, status, update, setManualExposure } = useCameraSettings();

type ChipId = "iso" | "shutter" | "ev" | "colour" | "wb" | "sharpness";

const open = ref<ChipId | null>(null);
const toggle = (id: ChipId) => (open.value = open.value === id ? null : id);

const manual = computed(() => (settings.value.exposure_manual as ProtoObject | undefined) ?? {});
const manualIso = computed(() => Number(manual.value.iso ?? 0));
const manualShutter = computed(() => String(manual.value.shutter_speed ?? "SPEED_AUTO"));

const isAuto = computed(() => settings.value.exposure_mode !== "EXP_MODE_MANUAL");

const evSteps = Array.from({ length: 9 }, (_, i) => {
  const value = i - 4;
  return { value: String(value), label: value > 0 ? `+${value}` : String(value) };
});

const sharpnessSteps = [
  { value: "0", label: "Off" },
  { value: "1", label: "Low" },
  { value: "2", label: "Medium" },
  { value: "3", label: "High" },
  { value: "4", label: "Max" },
];

const enumSteps = (name: string, strip: string) =>
  enumNames(name).map((value) => ({ value, label: value.replace(strip, "").replace(/_/g, " ") }));

const chips = computed(() => [
  { id: "iso" as const, label: "ISO", value: isAuto.value ? "Auto" : isoLabel(manualIso.value) },
  {
    id: "shutter" as const,
    label: "SHUTTER",
    value: isAuto.value ? "Auto" : shutterLabel(manualShutter.value),
  },
  { id: "ev" as const, label: "EV", value: String(settings.value.exposure_bias ?? 0) },
  {
    id: "colour" as const,
    label: "COLOR",
    value: String(settings.value.color_mode ?? "—").replace("COLOR_MODE_", ""),
  },
  {
    id: "wb" as const,
    label: "WB",
    value: String(settings.value.white_balance ?? "—").replace("WB_", ""),
  },
  {
    id: "sharpness" as const,
    label: "SHARP",
    value: sharpnessSteps[Number(settings.value.sharpness ?? 0)]?.label ?? "—",
  },
]);

const FIELD_OF: Record<ChipId, string> = {
  iso: "exposure_manual",
  shutter: "exposure_manual",
  ev: "exposure_bias",
  colour: "color_mode",
  wb: "white_balance",
  sharpness: "sharpness",
};

const VERDICTS = {
  applied: { icon: "i-lucide-check", color: "text-success" },
  differs: { icon: "i-lucide-arrow-left-right", color: "text-warning" },
  assumed: { icon: "i-lucide-circle-help", color: "text-muted" },
  rejected: { icon: "i-lucide-x", color: "text-error" },
} as const;

const verdict = (id: ChipId) => {
  const entry = status.value[FIELD_OF[id]];
  return entry ? VERDICTS[entry.outcome] : null;
};

const busy = (id: ChipId) => saving.value === FIELD_OF[id];
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-6">
      <button
        v-for="chip in chips"
        :key="chip.id"
        type="button"
        class="flex flex-col items-center gap-0.5 rounded-lg px-2 py-2 transition-colors"
        :class="open === chip.id ? 'bg-elevated' : 'hover:bg-elevated/60'"
        @click="toggle(chip.id)"
      >
        <span class="flex items-center gap-1 text-[10px] font-medium tracking-wider text-dimmed">
          {{ chip.label }}
          <UIcon
            v-if="verdict(chip.id)"
            :name="verdict(chip.id)!.icon"
            :class="verdict(chip.id)!.color"
            class="size-3"
          />
        </span>
        <span class="truncate text-sm font-medium text-highlighted">{{ chip.value }}</span>
      </button>
    </div>

    <div v-if="open" class="rounded-lg bg-elevated/50 p-2">
      <CameraWheel
        v-if="open === 'iso'"
        :steps="isoSteps()"
        :model-value="isAuto ? '0' : String(manualIso)"
        :busy="busy('iso')"
        @update:model-value="(value) => setManualExposure({ iso: Number(value) })"
      />
      <CameraWheel
        v-else-if="open === 'shutter'"
        :steps="shutterSteps()"
        :model-value="isAuto ? 'SPEED_AUTO' : manualShutter"
        :busy="busy('shutter')"
        @update:model-value="(value) => setManualExposure({ shutter_speed: value })"
      />
      <CameraWheel
        v-else-if="open === 'ev'"
        :steps="evSteps"
        :model-value="String(settings.exposure_bias ?? 0)"
        :busy="busy('ev')"
        @update:model-value="(value) => update('EXPOSURE_BIAS', 'exposure_bias', Number(value))"
      />
      <CameraWheel
        v-else-if="open === 'colour'"
        :steps="enumSteps('insta360.messages.PhotographyOptions.COLOR_MODE', 'COLOR_MODE_')"
        :model-value="settings.color_mode ? String(settings.color_mode) : undefined"
        :busy="busy('colour')"
        @update:model-value="(value) => update('COLOR_MODE', 'color_mode', value)"
      />
      <CameraWheel
        v-else-if="open === 'wb'"
        :steps="enumSteps('insta360.messages.PhotographyOptions.WhiteBalance', 'WB_')"
        :model-value="settings.white_balance ? String(settings.white_balance) : undefined"
        :busy="busy('wb')"
        @update:model-value="(value) => update('WHITE_BALANCE', 'white_balance', value)"
      />
      <CameraWheel
        v-else-if="open === 'sharpness'"
        :steps="sharpnessSteps"
        :model-value="String(settings.sharpness ?? 0)"
        :busy="busy('sharpness')"
        @update:model-value="(value) => update('SHARPNESS', 'sharpness', Number(value))"
      />
    </div>

    <p v-if="isAuto && (open === 'iso' || open === 'shutter')" class="text-xs text-muted">
      Choosing a value switches the camera to manual exposure.
    </p>
  </div>
</template>
