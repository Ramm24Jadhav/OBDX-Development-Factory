import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Share, Text } from 'react-native';

import { AuroraHero, BorderBeam, GlassDock, MaskedAvatars, RevealLoader, ShareSheet, revealStep, shareBody } from '../src';
import { accessibilityProblems } from './a11y';

const noop = () => undefined;

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('Vengeance UI ports', () => {
  it('each has a name and role on its controls and touch targets of at least 44 points', async () => {
    const all = [
      <ShareSheet text="Payment REF 20931" />, <GlassDock items={[{ id: 'pay', label: 'Pay', icon: '↗' }]} value="pay" onAction={noop} />,
      <AuroraHero heading="Good morning" />, <RevealLoader loading={false}><Text>Accounts</Text></RevealLoader>, <BorderBeam><Text>Offer</Text></BorderBeam>,
      <MaskedAvatars people={[{ name: 'Priya Nair' }, { name: 'Arjun Rao' }]} />,
    ];
    expect(all.length).toBe(6);
    for (const element of all) {
      await render(element);
      expect(accessibilityProblems()).toEqual([]);
    }
  });

  it('the share sheet opens and sends the text and link by email, messages or the device share', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const onShare = jest.fn();
    await render(<ShareSheet testID="s" text="IBAN GB29" url="https://bank.example/pay" onShare={onShare} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await fireEvent.press(screen.getByTestId('s-email'));
    expect(open).toHaveBeenCalledWith('mailto:?subject=Share&body=' + encodeURIComponent('IBAN GB29\nhttps://bank.example/pay'));
    await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await fireEvent.press(screen.getByTestId('s-system'));
    expect(share).toHaveBeenCalledWith({ title: 'Share', message: 'IBAN GB29\nhttps://bank.example/pay', url: 'https://bank.example/pay' });
    expect(onShare.mock.calls).toEqual([['email'], ['system']]);
    expect(shareBody('Ref 1', 'javascript:alert(1)')).toBe('Ref 1');
  });

  it('the glass dock names each shortcut, marks the current one and shows the name while pressed', async () => {
    const onAction = jest.fn();
    await render(<GlassDock testID="d" items={[{ id: 'pay', label: 'Pay' }, { id: 'cards', label: 'Cards' }]} value="cards" onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Cards' }).props.accessibilityState.selected).toBe(true);
    await fireEvent(screen.getByTestId('d-pay'), 'pressIn');
    expect(screen.getByText('Pay', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent(screen.getByTestId('d-pay'), 'pressOut');
    expect(screen.queryByText('Pay', { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(screen.getByTestId('d-cards'));
    expect(onAction).toHaveBeenCalledWith('cards');
  });

  it('the reveal loader covers the content while loading, then lifts and calls back', async () => {
    const onComplete = jest.fn();
    const shown = (loading: boolean) => <RevealLoader text="Bank" loading={loading} onComplete={onComplete}><Text>Accounts</Text></RevealLoader>;
    const { rerender } = await render(shown(true));
    expect(screen.getByRole('progressbar', { name: 'Bank' })).toBeTruthy();
    await rerender(shown(false));
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect([0, 4, 5, 9].map((i) => revealStep(i, 'center'))).toEqual([4, 0, 0, 4]);
  });

  it('masked avatars name everyone, count the rest and show a name on press', async () => {
    await render(<MaskedAvatars max={2} people={[{ name: 'Priya Nair' }, { name: 'Arjun Rao' }, { name: 'Meera Iyer' }]} />);
    expect(screen.getByLabelText('and 1 more')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Meera Iyer' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Priya Nair' }));
    expect(screen.getByText('Priya Nair', { includeHiddenElements: true })).toBeTruthy();
  });
});
