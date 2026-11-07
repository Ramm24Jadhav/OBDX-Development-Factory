import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';

import { Button, Card, ProgressBar, TextField, ThemeProvider, ToggleGroup } from '../src';
import { Enter } from '../src/motion';

/* The test renderer has no native animation thread, so the native-driver animations run in JS here, where the test can watch them. */
const { timing, spring } = Animated;
jest.spyOn(Animated, 'timing').mockImplementation((v, c) => timing(v, { ...c, useNativeDriver: false }));
jest.spyOn(Animated, 'spring').mockImplementation((v, c) => spring(v, { ...c, useNativeDriver: false }));

const style = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;
const transform = (id: string, key: string) => ((style(id).transform as Record<string, number>[] | undefined) ?? []).find((x) => key in x)?.[key];
const later = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('the motion layer', () => {
  it('enters with the component style\'s scroll effect, from hidden to its end state', async () => {
    await render(<ThemeProvider style={{ motion: { scroll: 'fadeup' } }}><Enter testID="e" /></ThemeProvider>);
    expect(style('e').opacity).toBe(0);
    await later(600);
    expect(style('e').opacity).toBe(1);
    expect(transform('e', 'translateY')).toBe(0);
  });

  it('has no entrance when the component style has none', async () => {
    await render(<Card testID="c" heading="Savings" />);
    expect(style('c').opacity).toBeUndefined();
  });

  it('shakes a field once when its error appears, and comes to rest', async () => {
    const field = (error?: string) => <TextField testID="f" label="Amount" value="" error={error} />;
    const { rerender } = await render(field());
    await rerender(field('Enter the amount.'));
    await later(40);
    expect(transform('f-control', 'translateX')).not.toBe(0);
    await later(600);
    expect(transform('f-control', 'translateX')).toBe(0);
  });

  it('grows a meter to its value', async () => {
    await render(<ProgressBar testID="p" items={[{ label: 'Groceries', value: 200, max: 400 }]} />);
    expect(style('p-Groceries-fill').width).toBe('0%');
    await later(800);
    expect(style('p-Groceries-fill').width).toBe('50%');
  });

  it('springs back after a press when the click effect is bounce', async () => {
    await render(<ThemeProvider style={{ motion: { click: 'bounce' } }}><Button testID="b" label="Pay" /></ThemeProvider>);
    await fireEvent(screen.getByTestId('b'), 'pressIn');
    await later(300);
    expect(transform('b', 'scale')).toBeLessThan(1);
    await fireEvent(screen.getByTestId('b'), 'pressOut');
    await later(1500);
    expect(transform('b', 'scale')).toBeCloseTo(1, 2);
  });

  it('slides the segment marker to the option chosen', async () => {
    const seg = (value: string) => <ToggleGroup testID="t" label="Show" value={value} options={['Day', 'Week', 'Month']} />;
    const { rerender } = await render(seg('Day'));
    await rerender(seg('Month'));
    await later(1500);
    expect(String(style('t-marker').left)).toMatch(/^66.66/);
  });
});

describe('under reduced motion', () => {
  beforeEach(async () => {
    await render(<Enter testID="warm" />);
    const listener = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.find((c) => c[0] === 'reduceMotionChanged')?.[1];
    await act(async () => { listener(true); });
  });

  it('shows every effect at its end state at once', async () => {
    await render(<ThemeProvider style={{ motion: { scroll: 'fadeup', click: 'bounce' } }}>
      <Enter testID="e" />
      <ProgressBar testID="p" items={[{ label: 'Groceries', value: 200, max: 400 }]} />
      <Button testID="b" label="Pay" busy />
    </ThemeProvider>);
    expect(style('e').opacity).toBe(1);
    expect(style('p-Groceries-fill').width).toBe('50%');
    await fireEvent(screen.getByTestId('b'), 'pressIn');
    await later(300);
    expect(transform('b', 'scale')).toBe(1);
  });
});
