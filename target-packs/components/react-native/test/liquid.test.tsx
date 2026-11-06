import { render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { Button, Card, ThemeProvider } from '../src';

// expo-blur needs a device; the test checks where the pack puts the BlurView, the frost itself is checked on a device
jest.mock('expo-blur', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { BlurView: (p: object) => <MockView testID="glass-blur" {...p} /> };
}, { virtual: true });

describe('Liquid glass on the phone', () => {
  it('puts a BlurView behind buttons and cards under the liquid look, over the fill and rim', async () => {
    await render(<ThemeProvider style={{ look: 'liquid', mode: 'dark' }}><Button label="Cancel" chroming="outlined" /><Card heading="Savings" /></ThemeProvider>);
    const blurs = screen.getAllByTestId('glass-blur');
    expect(blurs).toHaveLength(2);
    expect(blurs[0].props.tint).toBe('dark');
    expect(blurs[0].props.pointerEvents).toBe('none');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveStyle({ backgroundColor: 'rgba(40, 40, 40, 0.62)' });
  });

  it('draws no blur for the other looks', async () => {
    await render(<ThemeProvider style={{ look: 'glass' }}><Button label="Cancel" chroming="outlined" /></ThemeProvider>);
    expect(screen.queryByTestId('glass-blur')).toBeNull();
  });

  it('keeps a solid surface and no blur when the phone asks for less transparency', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
    await render(<ThemeProvider style={{ look: 'liquid' }}><Button label="Cancel" chroming="outlined" /></ThemeProvider>);
    await waitFor(() => expect(screen.queryByTestId('glass-blur')).toBeNull());
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveStyle({ backgroundColor: 'rgba(255, 255, 255, 0.6)' });
  });
});
