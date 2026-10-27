import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, TextField } from '../../components';
import { useForm } from '../useForm';

function Sample() {
  const form = useForm({ remarks: '' }, { remarks: { label: 'Remarks', required: true, maxLength: 5 } });
  return (
    <>
      <TextField testID="remarks" label="Remarks" value={form.values.remarks} onChange={form.setValue('remarks')}
                 error={form.errors.remarks} />
      <Button testID="submit" label="Submit" onPress={() => form.validate()} />
    </>
  );
}

test('shows required and length messages', async () => {
  await render(<Sample />);
  await fireEvent.press(screen.getByTestId('submit'));
  expect(await screen.findByText('Enter Remarks.')).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('remarks-input'), 'too long');
  await fireEvent.press(screen.getByTestId('submit'));
  expect(await screen.findByText('Remarks can have at most 5 characters.')).toBeTruthy();
});
