<!-- The frame of a screen, with its title and, at the bottom, its actions (the actions slot). -->
<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <main class="obdx-screen">
    <h1 class="obdx-title">{{ title }}</h1>
    <slot />
    <div v-if="$slots.actions" class="obdx-actions"><slot name="actions" /></div>
  </main>
</template>
