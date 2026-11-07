<!-- Choose one of a few options, all visible; the chosen mark pops in. -->
<script setup lang="ts">
import { useId } from 'vue';

import Field from './Field.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { options: string[] }>();
const value = defineModel<string>({ default: '' });
const name = useId();
</script>

<template>
  <Field :testID="props.testID" :label="props.label" :required="props.required" :helpText="props.helpText" :error="props.error">
    <div role="radiogroup" :aria-label="props.label">
      <label v-for="option in props.options" :key="option" class="obdx-choice">
        <input v-model="value" type="radio" :name="name" :value="option" :disabled="props.readOnly" :data-testid="`${props.testID}-option-${option}`" />
        {{ option }}
      </label>
    </div>
  </Field>
</template>
