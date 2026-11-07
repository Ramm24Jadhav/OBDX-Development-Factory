<!-- Choose one option from a list. -->
<script setup lang="ts">
import { useId } from 'vue';

import Field from './Field.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { options: string[] }>();
const value = defineModel<string>({ default: '' });
const id = useId();
</script>

<template>
  <Field :testID="props.testID" :label="props.label" :required="props.required" :helpText="props.helpText" :error="props.error" :inputId="id">
    <select :id="id" v-model="value" class="obdx-input" :data-testid="`${props.testID}-input`" :required="props.required" :disabled="props.readOnly"
            :aria-invalid="props.error ? true : undefined">
      <option value="">{{ props.placeholder || 'Select' }}</option>
      <option v-for="option in props.options" :key="option" :value="option">{{ option }}</option>
    </select>
  </Field>
</template>
