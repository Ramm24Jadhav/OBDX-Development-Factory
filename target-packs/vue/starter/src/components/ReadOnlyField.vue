<!-- A value to show, not to edit. -->
<script setup lang="ts">
import Field from './Field.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { modelValue?: string | number | null }>();
</script>

<template>
  <Field :testID="props.testID" :label="props.label" :helpText="props.helpText">
    <div class="obdx-value" :data-testid="`${props.testID}-value`">{{ props.modelValue === '' || props.modelValue == null ? '-' : props.modelValue }}</div>
  </Field>
</template>
