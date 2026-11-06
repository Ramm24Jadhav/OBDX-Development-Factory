<!-- A money amount: the currency's decimals (two unless set), grouped when the customer leaves the field. -->
<script setup lang="ts">
import { ref, watch } from 'vue';

import TextField from './TextField.vue';
import type { FieldProps } from './types';

const props = defineProps<FieldProps & { decimals?: number }>();
const value = defineModel<number | null>({ default: null });
const places = () => props.decimals ?? 2;
const show = (n: number | null) => (n === null ? '' : n.toFixed(places()).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
const text = ref(show(value.value));
watch(value, (v) => { if (v !== Number(text.value.replace(/,/g, ''))) { text.value = show(v); } });
watch(text, (typed) => {
  const clean = typed.replace(/[^0-9.,]/g, '');
  if (clean !== typed) { text.value = clean; return; }
  const n = Number(clean.replace(/,/g, ''));
  value.value = clean === '' || Number.isNaN(n) ? null : n;
});
const leave = () => { text.value = show(value.value === null ? null : Math.round(value.value * 10 ** places()) / 10 ** places()); };
</script>

<template>
  <TextField v-model="text" v-bind="props" inputmode="decimal" @blur="leave" />
</template>
