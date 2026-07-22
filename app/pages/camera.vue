<script setup lang="ts">
const { isConnected } = useCamera();
const { device, settings, mode, loading, error, load } = useCameraSettings();

useHead({ title: "Camera" });

/** Normal keeps the essentials visible; Pro exposes the exposure controls. */
const pro = ref(true);

const battery = computed(() => {
  const status = device.value.battery_status as Record<string, unknown> | undefined;
  return typeof status?.battery_level === "number" ? status.battery_level : null;
});

const storage = computed(() => {
  const state = device.value.storage_state as Record<string, unknown> | undefined;
  if (typeof state?.free_space !== "number") return null;
  return state.free_space / 1e9;
});

/** The camera reports remaining recording time in seconds. */
const remaining = computed(() => {
  const seconds = settings.value.remaining_time;
  if (typeof seconds !== "number" || seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
});

const resolution = computed(() =>
  settings.value.record_resolution
    ? String(settings.value.record_resolution).replace("RES_", "").replace(/_/g, " ")
    : null,
);

const modes = [
  { label: "Video", value: "FUNCTION_MODE_NORMAL_VIDEO" },
  { label: "Photo", value: "FUNCTION_MODE_NORMAL_IMAGE" },
];
</script>

<template>
  <UDashboardPanel id="camera">
    <template #header>
      <UDashboardNavbar title="Camera">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loading"
            :disabled="!isConnected"
            aria-label="Reload settings"
            @click="load"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!isConnected" class="py-16 text-center text-muted">
        Connect to the camera to control it.
      </div>

      <div v-else class="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div class="relative overflow-hidden rounded-xl bg-elevated">
          <LiveView />
          <div
            class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 text-xs"
          >
            <div class="flex flex-col gap-1">
              <span v-if="remaining" class="rounded bg-black/55 px-2 py-1 text-white">
                {{ remaining }} left
              </span>
              <span v-if="storage" class="rounded bg-black/55 px-2 py-1 text-white">
                {{ storage.toFixed(1) }} GB free
              </span>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span v-if="resolution" class="rounded bg-black/55 px-2 py-1 text-white">
                {{ resolution }}
              </span>
              <span v-if="battery !== null" class="rounded bg-black/55 px-2 py-1 text-white">
                {{ battery }}%
              </span>
            </div>
          </div>
        </div>

        <UAlert
          v-if="error"
          icon="i-lucide-triangle-alert"
          color="warning"
          variant="subtle"
          :title="error"
        />

        <div class="flex items-center gap-3">
          <UTabs
            :items="[{ label: 'Normal', value: 'normal' }, { label: 'Pro', value: 'pro' }]"
            :model-value="pro ? 'pro' : 'normal'"
            size="sm"
            @update:model-value="(value) => (pro = value === 'pro')"
          />
          <USelect v-model="mode" :items="modes" size="sm" class="ml-auto w-32" />
        </div>

        <CameraProBar v-if="pro" />

        <CameraSettings />
      </div>
    </template>
  </UDashboardPanel>
</template>
