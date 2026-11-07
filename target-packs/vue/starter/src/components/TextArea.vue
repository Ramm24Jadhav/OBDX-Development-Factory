<!-- Several lines of text, with a counter when there is a limit. -->
<script setup lang="ts">
import { useId } from 'vue';

import Field from './Field.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { rows?: number }>();
const value = defineModel<string>({ default: '' });
const id = useId();
</script>

<template>
  <Field :testID="props.testID" :label="props.label" :required="props.required" :helpText="props.helpText" :error="props.error" :inputId="id">
    <textarea :id="id" v-model="value" class="obdx-input" :rows="props.rows ?? 3" :data-testid="`${props.testID}-input`" :required="props.required"
              :readonly="props.readOnly" :placeholder="props.placeholder" :maxlength="props.maxLength"
              :aria-invalid="props.error ? true : undefined" />
    <div v-if="props.maxLength" class="obdx-help" aria-hidden="true">{{ value.length }}/{{ props.maxLength }}</div>
  </Field>
</template>
