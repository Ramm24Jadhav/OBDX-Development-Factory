<!--
  {{title}}: page built from the approved Screen Model "{{modelName}}" by the OBDX Development Factory.
  Every field and action keeps its Screen Model id as testID (rendered as data-testid).
-->
<script setup lang="ts">
import { ref } from 'vue';

import { ApiError } from '../../api/client';
import { {{imports}} } from '../../components';
import { useForm } from '../../forms/useForm';
import { t } from '../../i18n';

const emit = defineEmits<{
  /** A secondary or link action, for navigation. */
  action: [actionId: string];
  /** The main action has succeeded. */
  done: [];
}>();

{{optionLists}}const form = useForm({
{{initialValues}}}, {
{{rules}}});
const busy = ref(false);
const failure = ref<string>();

async function submit() {
  if (!form.validate()) {
    return;
  }
  busy.value = true;
  failure.value = undefined;
  try {
    // Send form.values with the module's API file (src/api/{{module}}Api.ts).
    emit('done');
  } catch (e) {
    failure.value = e instanceof ApiError ? e.message : t('common.failed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Screen :title="t('{{screenKey}}.title')">
{{sections}}    <template #actions>
      <div v-if="failure" class="obdx-error" role="alert">{{ failure }}</div>
{{actions}}    </template>
  </Screen>
</template>
