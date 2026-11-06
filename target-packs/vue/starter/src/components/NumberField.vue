<!-- A number (null when empty), on the number pad. -->
<script setup lang="ts">
import { ref, watch } from 'vue';

import TextField from './TextField.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { decimals?: number }>();
const value = defineModel<number | null>({ default: null });
const text = ref(value.value === null ? '' : String(value.value));
watch(value, (v) => { if (v !== Number(text.value)) { text.value = v === null ? '' : String(v); } });
watch(text, (typed) => {
  const clean = typed.replace(props.decimals ? /[^0-9.]/g : /[^0-9]/g, '');
  if (clean !== typed) { text.value = clean; return; }
  value.value = clean === '' || Number.isNaN(Number(clean)) ? null : Number(clean);
});
</script>

<template>
  <TextField v-model="text" v-bind="props" :inputmode="props.decimals ? 'decimal' : 'numeric'" />
</template>
