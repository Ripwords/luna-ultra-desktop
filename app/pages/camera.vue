<script setup lang="ts">
const { isConnected } = useCamera();
const { device, settings, loading, error, load } = useCameraSettings();
const { active, starting, error: liveError, diagnostics, start, stop } = useLiveView();

useHead({ title: "Camera" });

/** The deep settings live in a slide-over, so the viewfinder never scrolls. */
const settingsOpen = ref(false);

/**
 * Opening the page should feel like picking up a camera: the preview starts on
 * its own as soon as we are connected, and stops when the connection drops.
 */
watch(
  isConnected,
  (connected) => {
    if (connected) void start();
    else void stop();
  },
  { immediate: true },
);

/**
 * The preview holds the camera's single HTTP connection. Release it *before*
 * navigating away and wait for it to close — otherwise the next page (e.g. the
 * gallery, which reads media over that same connection) races the tear-down,
 * its requests fail, and the health detector force-disconnects the camera.
 */
onBeforeRouteLeave(async () => {
  await stop();
});

const battery = computed(() => {
  const status = device.value.battery_status as Record<string, unknown> | undefined;
  return typeof status?.battery_level === "number" ? status.battery_level : null;
});

const batteryClass = computed(() => {
  if (battery.value === null) return "";
  if (battery.value <= 20) return "text-red-400";
  if (battery.value <= 40) return "text-amber-300";
  return "";
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

/** One quiet line at the top of the stage, so errors never reflow the layout. */
const topError = computed(() => liveError.value ?? error.value ?? null);
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
          <UButton
            icon="i-lucide-sliders-horizontal"
            color="neutral"
            variant="ghost"
            :disabled="!isConnected"
            aria-label="Camera settings"
            @click="settingsOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!isConnected" class="flex flex-1 items-center justify-center text-muted">
        Connect to the camera to control it.
      </div>

      <div v-else class="flex min-h-0 flex-1 flex-col gap-3">
        <!-- Viewfinder: the hero. Everything else floats over it. -->
        <div class="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
          <LiveView class="absolute inset-0" />

          <!-- Starting / stopped state, centred over the black stage -->
          <div
            v-if="!active"
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/60"
          >
            <template v-if="starting">
              <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
              <span class="text-sm">Starting preview…</span>
            </template>
            <UButton
              v-else
              icon="i-lucide-play"
              color="neutral"
              variant="subtle"
              label="Start preview"
              @click="start"
            />
          </div>

          <!-- Top HUD -->
          <div
            class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 font-mono text-xs text-white"
          >
            <div class="flex flex-col items-start gap-1">
              <span v-if="remaining" class="rounded bg-black/50 px-2 py-1 backdrop-blur-md">
                {{ remaining }} left
              </span>
              <span v-if="storage" class="rounded bg-black/50 px-2 py-1 backdrop-blur-md">
                {{ storage.toFixed(1) }} GB
              </span>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span v-if="resolution" class="rounded bg-black/50 px-2 py-1 backdrop-blur-md">
                {{ resolution }}
              </span>
              <span
                v-if="battery !== null"
                class="flex items-center gap-1 rounded bg-black/50 px-2 py-1 backdrop-blur-md"
                :class="batteryClass"
              >
                <UIcon name="i-lucide-battery" class="size-3.5" />
                {{ battery }}%
              </span>
            </div>
          </div>

          <!-- Error strip, sitting under the HUD so nothing shifts -->
          <div
            v-if="topError"
            class="absolute inset-x-0 top-12 flex justify-center px-3"
          >
            <span
              class="flex items-center gap-1.5 rounded-lg bg-warning/85 px-3 py-1.5 text-xs text-white backdrop-blur-md"
            >
              <UIcon name="i-lucide-triangle-alert" class="size-3.5" />
              {{ topError }}
            </span>
          </div>

          <!-- Quick exposure bar + gear, along the bottom of the viewfinder -->
          <div class="absolute inset-x-0 bottom-0 p-2">
            <CameraProBar @open-settings="settingsOpen = true" />
          </div>
        </div>

        <!-- Mode strip + shutter -->
        <CameraCaptureBar />
      </div>

      <!-- Portals to the document body, so it lives here without disturbing the panel slots -->
      <USlideover
        v-model:open="settingsOpen"
        title="Camera settings"
        description="Everything the camera exposes."
      >
        <template #body>
          <CameraSettings />

          <details v-if="diagnostics.length > 0" class="mt-8 text-sm">
            <summary class="cursor-pointer text-muted">Live view diagnostics</summary>
            <pre class="mt-2 overflow-x-auto rounded bg-elevated p-3 text-xs">{{ diagnostics.join("\n") }}</pre>
          </details>
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
