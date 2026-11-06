<!-- On or off. -->
<script setup lang="ts">
import type { FieldProps } from './types';

const props = defineProps<FieldProps>();
const value = defineModel<boolean>({ default: false });
</script>

<template>
  <div class="obdx-field" :data-testid="props.testID">
    <label class="obdx-switch">
      <span class="obdx-label">{{ props.label }}</span>
      <input v-model="value" type="checkbox" role="switch" :disabled="props.readOnly" :data-testid="`${props.testID}-input`" />
    </label>
    <div v-if="props.helpText" class="obdx-help">{{ props.helpText }}</div>
  </div>
</template>
