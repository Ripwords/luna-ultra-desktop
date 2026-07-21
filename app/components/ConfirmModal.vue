<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    confirmLabel?: string;
    confirmColor?: "error" | "primary";
  }>(),
  { confirmLabel: "Confirm", confirmColor: "error" },
);

const emit = defineEmits<{ close: [confirmed: boolean] }>();
</script>

<template>
  <UModal
    :close="{ onClick: () => emit('close', false) }"
    :title="title"
    :description="description"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton label="Cancel" color="neutral" variant="outline" @click="emit('close', false)" />
      <UButton :label="confirmLabel" :color="confirmColor" @click="emit('close', true)" />
    </template>
  </UModal>
</template>
