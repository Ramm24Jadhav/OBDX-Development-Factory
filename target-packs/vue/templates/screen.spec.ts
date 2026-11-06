import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';

import {{Screen}}Page from '../{{Screen}}Page.vue';

// From the approved Screen Model "{{modelName}}": every field and action keeps its id as data-testid.
const ids = [{{componentIds}}];

test('shows every field and action of the approved design', () => {
  const page = mount({{Screen}}Page);
  for (const id of ids) {
    expect(page.find(`[data-testid="${id}"]`).exists(), id).toBe(true);
  }
});
{{requiredTest:
test('asks for the required fields', async () => {
  const page = mount({{Screen}}Page);
  await page.find('[data-testid="{{primaryAction}}"]').trigger('click');
  expect(page.findAll('[role="alert"]').filter((e) => e.text().startsWith('Enter '))).toHaveLength({{requiredCount}});
});
}}
