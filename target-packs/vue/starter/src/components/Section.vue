<!-- A titled group of fields, in up to three columns on wide screens. -->
<script setup lang="ts">
const props = defineProps<{ title?: string; columns?: number }>();
const columns = () => Math.min(Math.max(props.columns ?? 1, 1), 3);
</script>

<template>
  <section class="obdx-section obdx-enter">
    <h2 v-if="props.title" class="obdx-section-title">{{ props.title }}</h2>
    <div :class="['obdx-grid', `obdx-columns-${columns()}`]"><slot /></div>
  </section>
</template>
