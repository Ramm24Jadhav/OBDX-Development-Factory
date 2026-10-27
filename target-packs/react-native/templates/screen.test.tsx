import { fireEvent, render, screen } from '@testing-library/react-native';

import { {{Screen}}Screen } from '../{{Screen}}Screen';

// From the approved Screen Model "{{modelName}}": every field and action keeps its id as testID.
const ids = [{{componentIds}}];

test('shows every field and action of the approved design', async () => {
  await render(<{{Screen}}Screen />);
  for (const id of ids) {
    expect(screen.getByTestId(id)).toBeTruthy();
  }
});
{{requiredTest:
test('asks for the required fields', async () => {
  await render(<{{Screen}}Screen />);
  await fireEvent.press(screen.getByTestId('{{primaryAction}}'));
  expect(await screen.findAllByText(/^Enter /)).toHaveLength({{requiredCount}});
});
}}
