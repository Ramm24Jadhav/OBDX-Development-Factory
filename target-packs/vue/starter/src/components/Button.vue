<!-- A screen action: primary (the main one), secondary or link. A busy button shimmers and cannot be pressed twice. -->
<script setup lang="ts">
defineProps<{ testID: string; label: string; variant?: 'primary' | 'secondary' | 'link'; disabled?: boolean; busy?: boolean }>();
const emit = defineEmits<{ press: [] }>();
</script>

<template>
  <button type="button" :class="['obdx-button', `obdx-button-${variant ?? 'secondary'}`, { 'obdx-busy': busy }]" :data-testid="testID"
          :disabled="disabled || busy" :aria-busy="busy || undefined" @click="emit('press')">
    {{ label }}
  </button>
</template>
