import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

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
  fireEvent.click(screen.getByTestId('{{primaryAction}}'));
  expect(await screen.findAllByText(/^Enter /)).toHaveLength({{requiredCount}});
});
}}
