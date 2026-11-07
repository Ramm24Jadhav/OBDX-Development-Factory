<!-- Choose any number of options. -->
<script setup lang="ts">
import Field from './Field.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { options: string[] }>();
const value = defineModel<string[]>({ default: () => [] });
</script>

<template>
  <Field :testID="props.testID" :label="props.label" :required="props.required" :helpText="props.helpText" :error="props.error">
    <div role="group" :aria-label="props.label">
      <label v-for="option in props.options" :key="option" class="obdx-choice">
        <input v-model="value" type="checkbox" :value="option" :disabled="props.readOnly" :data-testid="`${props.testID}-option-${option}`" />
        {{ option }}
      </label>
    </div>
  </Field>
</template>
