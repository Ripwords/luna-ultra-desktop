<script setup lang="ts">
const { isConnected } = useCamera();
useHead({ title: "Camera" });
</script>

<template>
  <UDashboardPanel id="camera">
    <template #header>
      <UDashboardNavbar title="Camera">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!isConnected" class="py-16 text-center text-muted">
        Connect to the camera to control it.
      </div>
      <div v-else class="grid gap-8 xl:grid-cols-2">
        <LiveView />
        <CameraSettings />
      </div>
    </template>
  </UDashboardPanel>
</template>
