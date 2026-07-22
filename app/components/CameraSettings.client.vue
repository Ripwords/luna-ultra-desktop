<script setup lang="ts">
import { CONTROL_SECTIONS, type Control } from "~/utils/cameraControls";
import { enumNames } from "~/utils/lunaProto";
import type { ProtoValue } from "~/utils/lunaProto";

const { settings, device, saving, status, update, updateDevice } = useCameraSettings();

/**
 * Each control reports what the camera said when the value was read straight
 * back, because plenty of these change nothing you can see in the preview.
 */
const VERDICTS = {
  applied: { icon: "i-lucide-check", color: "text-success", hint: "Read back from the camera" },
  differs: {
    icon: "i-lucide-arrow-left-right",
    color: "text-warning",
    hint: "Camera chose a different value",
  },
  assumed: {
    icon: "i-lucide-circle-help",
    color: "text-muted",
    hint: "Camera reported nothing — this is its default",
  },
  rejected: { icon: "i-lucide-x", color: "text-error", hint: "Camera refused it" },
} as const;

const verdict = (field: string) => {
  const entry = status.value[field];
  return entry ? { ...VERDICTS[entry.outcome], actual: entry.actual } : null;
};

const source = (control: Control) => (control.scope === "device" ? device : settings);
const valueOf = (control: Control) => source(control).value[control.field];

const options = (name: string) =>
  enumNames(name).map((value) => ({ label: value.replace(/_/g, " "), value }));

const apply = (control: Control, value: ProtoValue) =>
  control.scope === "device"
    ? updateDevice(control.option, control.field, value)
    : update(control.option, control.field, value);

/**
 * Before any read we know nothing, so leave everything enabled rather than
 * greying out controls that may well work.
 */
const supported = computed(() => new Set((settings.value.$supported as string[] | undefined) ?? []));
const isSupported = (control: Control) =>
  control.scope === "device" || supported.value.size === 0 || supported.value.has(control.option);

const asString = (control: Control): string | undefined => {
  const value = valueOf(control);
  return value === undefined ? undefined : String(value);
};

const asNumber = (control: Control): number => {
  const value = valueOf(control);
  return typeof value === "number" ? value : Number(value ?? 0);
};
</script>

<template>
  <div class="space-y-8">
    <section v-for="section in CONTROL_SECTIONS" :key="section.title" class="space-y-3">
      <h3 class="text-xs font-medium tracking-wider text-dimmed">
        {{ section.title.toUpperCase() }}
      </h3>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField v-for="control in section.controls" :key="control.field" :help="control.hint">
          <template #label>
            <span class="flex items-center gap-1.5">
              {{ control.label }}
              <UIcon
                v-if="verdict(control.field)"
                :name="verdict(control.field)!.icon"
                :class="verdict(control.field)!.color"
                class="size-3.5"
                :title="
                  verdict(control.field)!.actual
                    ? `${verdict(control.field)!.hint}: ${verdict(control.field)!.actual}`
                    : verdict(control.field)!.hint
                "
              />
            </span>
          </template>

          <USelect
            v-if="control.kind === 'select'"
            :model-value="asString(control)"
            :items="options(control.values!)"
            :disabled="!isSupported(control) || saving === control.field"
            :loading="saving === control.field"
            class="w-full"
            @update:model-value="(value: string) => apply(control, value)"
          />

          <USwitch
            v-else-if="control.kind === 'toggle'"
            :model-value="Boolean(valueOf(control))"
            :disabled="!isSupported(control) || saving === control.field"
            @update:model-value="(value: boolean) => apply(control, value)"
          />

          <div v-else class="flex flex-wrap gap-1.5">
            <UButton
              v-for="step in control.steps"
              :key="step.value"
              :label="step.label"
              size="xs"
              :color="asNumber(control) === step.value ? 'primary' : 'neutral'"
              :variant="asNumber(control) === step.value ? 'solid' : 'subtle'"
              :disabled="!isSupported(control) || saving === control.field"
              @click="apply(control, step.value)"
            />
          </div>
        </UFormField>
      </div>
    </section>

    <details class="text-sm">
      <summary class="cursor-pointer text-muted">Everything the camera reported</summary>
      <pre class="mt-2 max-h-96 overflow-auto rounded bg-elevated p-3 text-xs">{{
        JSON.stringify({ photography: settings, device }, null, 2)
      }}</pre>
    </details>
  </div>
</template>
