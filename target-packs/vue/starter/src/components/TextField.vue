<!-- Single-line text. -->
<script setup lang="ts">
import { useId } from 'vue';

import Field from './Field.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { inputmode?: 'text' | 'numeric' | 'decimal'; type?: string }>();
const value = defineModel<string>({ default: '' });
const emit = defineEmits<{ blur: [] }>();
const id = useId();
</script>

<template>
  <Field :testID="props.testID" :label="props.label" :required="props.required" :helpText="props.helpText" :error="props.error" :inputId="id">
    <input :id="id" v-model="value" class="obdx-input" :type="props.type ?? 'text'" :data-testid="`${props.testID}-input`" :required="props.required"
           :readonly="props.readOnly" :placeholder="props.placeholder" :maxlength="props.maxLength" :inputmode="props.inputmode"
           :aria-invalid="props.error ? true : undefined" @blur="emit('blur')" />
  </Field>
</template>
