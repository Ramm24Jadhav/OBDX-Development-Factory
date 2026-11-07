import { render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { StyleSheet, Text } from 'react-native';

import * as pack from '../src';
import { Button, CheckboxGroup, FileUpload, FilterChips, IconButton, OtpInput, PARTS, PaymentSchedule, Slider, TextField, Toggle, ToggleGroup, VARIANTS, makeTheme,
  part, useTheme } from '../src';
import { withVariant } from '../src/variants';
import { accessibilityProblems } from './a11y';

const wave1 = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'variants', 'v1.json'), 'utf8')) as {
  components: Record<string, { kind: string; variants: string[]; packs: Record<string, { name: string }> }>;
};
const t = makeTheme();
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

describe('every V1 component takes each of its variants', () => {
  for (const [id, c] of Object.entries(wave1.components)) {
    if (!c.packs['react-native']) { continue; }
    const name = c.packs['react-native'].name;
    it.each(c.variants)(`${id} (${name}): %s`, (v) => {
      expect(VARIANTS[name]).toEqual([c.kind, c.variants]);
      expect(typeof PARTS[c.kind][v]).toBe('function');
      expect(() => PARTS[c.kind][v](t, { on: true, focused: true })).not.toThrow();
      expect((pack as Record<string, { displayName?: string }>)[name].displayName).toBe(name);
    });
  }
});

describe('the variant theme', () => {
  function Probe() {
    const theme = useTheme();
    return <Text testID="probe">{JSON.stringify({ v: theme.variant ?? null, r: theme.radius.control, click: theme.motion.click })}</Text>;
  }
  const Probed = withVariant('Button', Probe);

  it('carries the variant and its settings to everything inside, and nothing without one', async () => {
    const { rerender } = await render(<Probed />);
    expect(JSON.parse(String(screen.getByTestId('probe').props.children)).v).toBeNull();
    await rerender(<Probed variant="pill" />);
    expect(JSON.parse(String(screen.getByTestId('probe').props.children))).toMatchObject({ v: { kind: 'button', id: 'pill' }, r: 999 });
    await rerender(<Probed variant="material" />);
    expect(JSON.parse(String(screen.getByTestId('probe').props.children)).click).toBe('ripple');
    await rerender(<Probed variant="nope" />);
    expect(JSON.parse(String(screen.getByTestId('probe').props.children)).v).toBeNull();
  });

  it('a part styles only the kinds it serves', () => {
    const tonal = { ...t, variant: { kind: 'button', id: 'tonal' } };
    expect(part(tonal, 'button', 'box')).toMatchObject({ backgroundColor: t.color.primarySoft });
    expect(part(tonal, 'iconbtn', 'box')).toEqual({});
    expect(part(t, 'button', 'box')).toEqual({});
  });
});

describe('the parts follow the variant', () => {
  it('Button tonal and IconButton circular', async () => {
    await render(<><Button label="Pay" variant="tonal" /><IconButton label="More" variant="circular" /></>);
    expect(screen.getByRole('button', { name: 'Pay' })).toHaveStyle({ backgroundColor: t.color.primarySoft });
    expect(screen.getByRole('button', { name: 'More' })).toHaveStyle({ borderRadius: 999, backgroundColor: t.color.surface3 });
    expect(accessibilityProblems()).toEqual([]);
  });

  it('TextField underlined and inline', async () => {
    const { rerender } = await render(<TextField testID="n" label="Name" value="" variant="underlined" />);
    const box = screen.getByTestId('n-input').parent!;
    expect(flat(box as never)).toMatchObject({ borderWidth: 0, borderBottomWidth: 1, borderRadius: 0 });
    await rerender(<TextField testID="n" label="Name" value="" variant="inline" />);
    expect(screen.getByTestId('n')).toHaveStyle({ flexDirection: 'row' });
  });

  it('Toggle labelled shows On or Off; ios turns green', async () => {
    const { rerender } = await render(<Toggle testID="t" label="Alerts" value variant="labelled" />);
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Alerts' })).toBeChecked();
    await rerender(<Toggle testID="t" label="Alerts" value variant="ios" />);
    expect(screen.queryByText('On')).toBeNull();
  });

  it('ToggleGroup pill fills the chosen marker; a composite gets its kind\'s variant', async () => {
    await render(<ToggleGroup testID="g" label="Show" options={['Day', 'Week']} value="Week" variant="pill" />);
    expect(screen.getByTestId('g-marker')).toHaveStyle({ borderRadius: 999, backgroundColor: t.color.primary });
    await render(<PaymentSchedule testID="r" label="Repeat" value="Once" variant="underline" />);
    expect(screen.getByTestId('r-marker')).toHaveStyle({ borderBottomWidth: 2 });
  });

  it('FilterChips outlined fills the chosen chip', async () => {
    await render(<FilterChips testID="f" label="Type" options={['Debit', 'Credit']} value={['Debit']} variant="outlined" />);
    expect(screen.getByTestId('f-option-Debit')).toHaveStyle({ backgroundColor: t.color.primary });
    expect(screen.getByTestId('f-option-Credit')).toHaveStyle({ backgroundColor: 'transparent' });
  });

  it('CheckboxGroup rows puts the mark on the right', async () => {
    await render(<CheckboxGroup testID="c" label="Alerts" options={['Email']} value={[]} variant="rows" />);
    expect(screen.getByTestId('c-option-Email')).toHaveStyle({ flexDirection: 'row-reverse', borderBottomWidth: 1 });
  });

  it('OtpInput underline, Slider ticks and bubble, FileUpload dropzone', async () => {
    await render(<OtpInput testID="o" label="Code" value="12" variant="underline" />);
    await render(<Slider testID="s" label="Amount" value={40} step={10} variant="ticks" />);
    expect(screen.getByTestId('s-input')).toBeTruthy();
    await render(<Slider testID="b" label="Amount" value={40} prefix="INR" variant="bubble" />);
    expect(screen.getAllByText('INR 40', { includeHiddenElements: true }).length).toBeGreaterThan(1);
    await render(<FileUpload testID="u" label="Statement" value={[]} pick={async () => []} variant="dropzone" />);
    expect(screen.getByRole('button', { name: /Choose a file/ })).toHaveStyle({ borderWidth: 2, backgroundColor: t.color.surface2 });
  });
});
