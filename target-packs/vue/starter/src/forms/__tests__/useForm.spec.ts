import { nextTick } from 'vue';
import { expect, test } from 'vitest';

import { useForm } from '../useForm';

test('checks required and length rules and clears a message when the field changes', async () => {
  const form = useForm({ payee: '', remarks: 'x'.repeat(20), amount: null as number | null }, {
    payee: { label: 'Payee', required: true },
    remarks: { label: 'Remarks', maxLength: 10 },
    amount: { label: 'Amount', required: true },
  });
  expect(form.validate()).toBe(false);
  expect(form.errors).toEqual({ payee: 'Enter Payee.', remarks: 'Remarks can have at most 10 characters.', amount: 'Enter Amount.' });
  form.values.payee = 'A. Rao';
  await nextTick();
  expect(form.errors.payee).toBeUndefined();
  form.values.remarks = 'Rent';
  form.values.amount = 1250;
  expect(form.validate()).toBe(true);
});
