<!-- The label, the control and the message under it; an error is an alert, so screen readers announce it. -->
<script setup lang="ts">
defineProps<{ testID: string; label: string; required?: boolean; helpText?: string; error?: string; inputId?: string }>();
</script>

<template>
  <div class="obdx-field" :data-testid="testID">
    <label class="obdx-label" :for="inputId">
      {{ label }}<span v-if="required" class="obdx-required"> *</span>
    </label>
    <div :class="{ 'obdx-shake': !!error }"><slot /></div>
    <div v-if="error" class="obdx-error" role="alert">{{ error }}</div>
    <div v-else-if="helpText" class="obdx-help">{{ helpText }}</div>
  </div>
</template>
