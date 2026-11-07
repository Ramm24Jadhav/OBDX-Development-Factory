import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuroraHero, BorderBeam, GlassDock, MaskedAvatars, RevealLoader, ShareSheet, revealStep, shareBody } from '../src';
import { violations } from './a11y';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Vengeance UI ports', () => {
  it('every component renders and passes axe', async () => {
    render(
      <div>
        <ShareSheet text="Payment REF 20931, 250.00 USD to A. Rao" />
        <GlassDock items={[{ id: 'pay', label: 'Pay', icon: '↗' }, { id: 'cards', label: 'Cards', icon: '▭' }]} value="pay" />
        <AuroraHero heading="Good morning, Priya" text="Your salary has arrived." />
        <RevealLoader text="Bank" loading={false}><p>Accounts</p></RevealLoader>
        <BorderBeam><p>Pre-approved loan</p></BorderBeam>
        <MaskedAvatars label="Joint holders" people={[{ name: 'Priya Nair' }, { name: 'Arjun Rao' }]} />
      </div>,
    );
    expect(await violations()).toEqual([]);
  });

  it('the share sheet copies the text and link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const onShare = vi.fn();
    render(<ShareSheet text="IBAN GB29 NWBK 6016 1331 9268 19" url="https://bank.example/pay" onShare={onShare} />);
    await userEvent.click(screen.getByRole('button', { name: /Share/ }));
    expect(screen.getByRole('dialog', { name: 'Share' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('IBAN GB29 NWBK 6016 1331 9268 19\nhttps://bank.example/pay');
    expect(onShare).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('status').textContent).toMatch(/Copied/);
  });

  it('the share sheet drops a link that is not http and offers the device share when there is one', async () => {
    expect(shareBody('Ref 1', 'javascript:alert(1)')).toBe('Ref 1');
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share });
    render(<ShareSheet text="Ref 1" />);
    await userEvent.click(screen.getByRole('button', { name: /Share/ }));
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(share).toHaveBeenCalledWith({ title: 'Share', text: 'Ref 1', url: undefined });
  });

  it('the glass dock names each shortcut, marks the current one and shows one label for the item in focus', async () => {
    const onAction = vi.fn();
    render(<GlassDock items={[{ id: 'pay', label: 'Pay' }, { id: 'cards', label: 'Cards' }]} value="cards" onAction={onAction} />);
    expect(screen.getByRole('button', { name: 'Cards' }).getAttribute('aria-current')).toBe('page');
    await userEvent.tab();
    expect(document.querySelector('.bx-dock-label')?.textContent).toBe('Pay');
    await userEvent.tab();
    expect(document.querySelector('.bx-dock-label span')?.className).toBe('is-from-right');
    await userEvent.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledWith('cards');
  });

  it('the reveal loader covers the content while loading, then lifts and calls back', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const { rerender } = render(<RevealLoader text="Bank" onComplete={onComplete}><button type="button">Accounts</button></RevealLoader>);
    expect(screen.getByRole('status').textContent).toContain('Bank');
    expect(document.querySelectorAll('.bx-reveal-bar')).toHaveLength(10);
    expect(document.querySelector('.bx-reveal-content')?.hasAttribute('inert')).toBe(true);
    rerender(<RevealLoader text="Bank" loading={false} onComplete={onComplete}><button type="button">Accounts</button></RevealLoader>);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(document.querySelector('.bx-reveal-content')?.hasAttribute('inert')).toBe(false);
  });

  it('the reveal order staggers bars from the start, the end, the centre or the edges', () => {
    expect([0, 9].map((i) => revealStep(i))).toEqual([0, 9]);
    expect([0, 9].map((i) => revealStep(i, 'end'))).toEqual([9, 0]);
    expect([0, 4, 5, 9].map((i) => revealStep(i, 'center'))).toEqual([4, 0, 0, 4]);
    expect([0, 4, 5, 9].map((i) => revealStep(i, 'edges'))).toEqual([0, 4, 4, 0]);
  });

  it('the border beam keeps its lap between 2 and 20 seconds and stands still on request', () => {
    const { container } = render(<><BorderBeam duration={60}>A</BorderBeam><BorderBeam duration={1} still>B</BorderBeam></>);
    const [a, b] = Array.from(container.querySelectorAll('.bx-border-beam'));
    expect(a.className).toContain('is-lap-20');
    expect(b.className).toContain('is-lap-2');
    expect(b.className).toContain('is-still');
  });

  it('masked avatars name everyone and count the rest past max', () => {
    render(<MaskedAvatars label="Joint holders" max={2} people={[{ name: 'Priya Nair' }, { name: 'Arjun Rao' }, { name: 'Meera Iyer' }]} />);
    expect(screen.getByRole('list', { name: 'Joint holders' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Priya Nair' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Meera Iyer' })).toBeNull();
    expect(screen.getByLabelText('and 1 more').textContent).toBe('+1');
  });

  it('each takes its variant as a bx-v class on its root', () => {
    const { container } = render(<>
      <GlassDock variant="solid" items={[{ id: 'pay', label: 'Pay' }]} /><AuroraHero variant="centered" heading="Hi" /><RevealLoader variant="gradient" loading={false}>A</RevealLoader>
      <BorderBeam variant="double">B</BorderBeam><MaskedAvatars variant="ringed" people={[{ name: 'Priya Nair' }]} /><ShareSheet variant="compact" text="Ref 1" />
    </>);
    expect(['.bx-glass-dock.bx-v-solid', '.bx-aurora-hero.bx-v-centered', '.bx-reveal.bx-v-gradient', '.bx-border-beam.bx-v-double', '.bx-masked-avatars.bx-v-ringed', '.bx-share.bx-v-compact'].filter((s) => !container.querySelector(s))).toEqual([]);
  });

  it('the aurora hero has its heading and stands still on request', () => {
    const { container } = render(<AuroraHero heading="Welcome" still><button type="button">Open an account</button></AuroraHero>);
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('is-still');
    fireEvent.click(screen.getByRole('button', { name: 'Open an account' }));
  });
});
