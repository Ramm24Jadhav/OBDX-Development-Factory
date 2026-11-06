import { h } from 'preact';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';

import { {{Screen}}Page } from '../{{Screen}}Page';

// From the approved Screen Model "{{modelName}}": every field and action keeps its id as data-testid.
const ids = [{{componentIds}}];

afterEach(cleanup);

test('shows every field and action of the approved design', () => {
  render(<{{Screen}}Page />);
  for (const id of ids) {
    expect(screen.getByTestId(id)).toBeTruthy();
  }
});
{{requiredTest:
test('asks for the required fields', async () => {
  render(<{{Screen}}Page />);
  // The Core Pack button's action (the elements do not render in jsdom); each field's message is on its data-error
  fireEvent(screen.getByTestId('{{primaryAction}}').querySelector('oj-c-button')!, new CustomEvent('ojAction', { bubbles: true }));
  await waitFor(() => expect(document.querySelectorAll('[data-error^="Enter "]')).toHaveLength({{requiredCount}}));
});
}}
