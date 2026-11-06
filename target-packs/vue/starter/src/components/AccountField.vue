<!-- The customer's accounts (masked numbers, loaded from the OBDX accounts service). -->
<script setup lang="ts">
import SelectField from './SelectField.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { options: string[] }>();
const value = defineModel<string>({ default: '' });
</script>

<template>
  <SelectField v-model="value" v-bind="props" :placeholder="props.placeholder || 'Select an account'" />
</template>
