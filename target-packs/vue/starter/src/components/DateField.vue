<!-- A date (the browser's date picker), as YYYY-MM-DD. -->
<script setup lang="ts">
import TextField from './TextField.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps>();
const value = defineModel<string>({ default: '' });
</script>

<template>
  <TextField v-model="value" v-bind="props" type="date" />
</template>
