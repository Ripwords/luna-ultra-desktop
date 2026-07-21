<script setup lang="ts">
const { info, library, host, error, isConnected, isBusy, available, connect, disconnect } = useCamera();

useHead({ title: "Connect" });

const celebrate = ref(0);
watch(isConnected, (connected) => {
  if (connected) celebrate.value += 1;
});
</script>

<template>
  <UDashboardPanel id="connect">
    <template #header>
      <UDashboardNavbar title="Connect">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="isConnected"
            label="Disconnect"
            color="neutral"
            variant="ghost"
            icon="i-lucide-unplug"
            @click="disconnect"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid h-full grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
        <div class="order-2 flex flex-col justify-center gap-6 lg:order-1 lg:pl-6">
          <template v-if="!isConnected">
            <div class="space-y-3">
              <h1 class="text-3xl font-semibold tracking-tight text-highlighted lg:text-4xl">
                Pair your Luna Ultra
              </h1>
              <p class="max-w-md text-muted">
                Join the camera's Wi-Fi network, then connect to browse, download and manage everything you shot.
              </p>
            </div>

            <UAlert
              v-if="!available"
              icon="i-lucide-monitor-down"
              color="warning"
              variant="subtle"
              title="Desktop app required"
              description="Connecting to the camera needs the packaged Luna Ultra desktop app. Run it with bun run dev."
            />

            <form class="flex max-w-md flex-col gap-3" @submit.prevent="connect">
              <UFormField label="Camera address" name="host">
                <UInput
                  v-model="host"
                  placeholder="192.168.42.1"
                  icon="i-lucide-router"
                  :disabled="isBusy || !available"
                  autocomplete="off"
                  spellcheck="false"
                  class="w-full font-mono"
                />
                <template #help>Default Luna Ultra Wi-Fi gateway. Include a port for the dev mock (127.0.0.1:18080).</template>
              </UFormField>

              <UAlert
                v-if="error"
                icon="i-lucide-triangle-alert"
                color="error"
                variant="subtle"
                :description="error"
              />

              <div class="flex items-center gap-3">
                <UButton
                  type="submit"
                  size="xl"
                  icon="i-lucide-cable"
                  :label="isBusy ? 'Connecting' : 'Connect camera'"
                  :loading="isBusy"
                  :disabled="!available"
                />
                <UButton size="xl" label="View downloads" color="neutral" variant="ghost" to="/downloads" />
              </div>
            </form>
          </template>

          <template v-else-if="info">
            <div class="space-y-1.5">
              <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
                {{ info.deviceName ?? "Luna Ultra" }}
              </h1>
              <p class="font-mono text-sm text-muted">{{ info.ssid ?? info.host }}</p>
            </div>

            <dl class="grid max-w-md grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div>
                <dt class="text-muted">Address</dt>
                <dd class="mt-0.5 font-mono text-default">{{ info.host }}</dd>
              </div>
              <div v-if="info.serial">
                <dt class="text-muted">Serial</dt>
                <dd class="mt-0.5 font-mono text-default">{{ info.serial }}</dd>
              </div>
              <div v-if="info.firmware">
                <dt class="text-muted">Firmware</dt>
                <dd class="mt-0.5 font-mono text-default">{{ info.firmware }}</dd>
              </div>
              <div>
                <dt class="text-muted">Media</dt>
                <dd class="mt-0.5 font-mono text-default">{{ library.length }} files</dd>
              </div>
            </dl>

            <div class="flex items-center gap-3">
              <UButton size="xl" icon="i-lucide-images" label="Open gallery" to="/gallery" />
            </div>
          </template>
        </div>

        <div class="order-1 h-72 min-h-0 lg:order-2 lg:h-full">
          <LunaModel class="size-full" :celebrate="celebrate" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
