<script setup lang="ts">
import { Screen } from '../../components';
import { t } from '../../i18n';
</script>

<template>
  <Screen :title="t('home.title')">
    <p>{{ t('home.welcome') }}</p>
  </Screen>
</template>
