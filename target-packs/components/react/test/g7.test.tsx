import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as pack from '../src';
import { AnimatedList, BellToggle, BentoGrid, BlurInText, BudgetGauge, CallChip, CardNav, CardStack, Carousel, ClickBurst, CountUp, DockNav, DocumentFolder, DotGrid, EdgeBlur,
  ElasticSlider, FadeInContent, FavouriteHeart, FlipCard, FocusWord, GlareHover, GlassPanel, GlideSelect, GlowBorderCard, GradientBackdrop, GradientText, HighlightBorder,
  HoldToConfirm, JellyRadio, LatticeLoader, LightBeams, LineWaves, MagneticButton, Marquee, OptionWheel, OtpSlots, ParticleBackdrop, PeekRating, PillNav, ProfileCard, PromptBar,
  ReceiptTear, RevealDigits, RollingDigits, RotatingText, RubberSegment, ScrollExpand, ScrollFloatText, ScrollReveal, ScrollStack, ScrubField, ShimmerText, SilkBackdrop,
  SlideToConfirm, SoftAurora, SplitFlapBoard, SpotlightCard, SquishSwitch, StaggeredMenu, StatusMark, SuccessCheck, SwipeRow, SwipeToast, TextReveal, TiltCard, Topography,
  TypedText, VoicePill, WarmTooltip } from '../src';
import { violations } from './a11y';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}
const G7 = ['RollingDigits', 'CountUp', 'SplitFlapBoard', 'RevealDigits', 'BlurInText', 'TextReveal', 'RotatingText', 'ShimmerText', 'GradientText', 'TypedText', 'FocusWord',
  'ScrollFloatText', 'FadeInContent', 'ScrollReveal', 'ScrollExpand', 'EdgeBlur', 'GlareHover', 'MagneticButton', 'HighlightBorder', 'ClickBurst', 'Marquee', 'AnimatedList',
  'SpotlightCard', 'TiltCard', 'FlipCard', 'CardStack', 'GlowBorderCard', 'BentoGrid', 'Carousel', 'ElasticSlider', 'OptionWheel', 'PillNav', 'DockNav', 'CardNav', 'StaggeredMenu',
  'DocumentFolder', 'ScrollStack', 'ProfileCard', 'GlassPanel', 'GradientBackdrop', 'SoftAurora', 'SilkBackdrop', 'DotGrid', 'LineWaves', 'LightBeams', 'Topography', 'ParticleBackdrop',
  'SlideToConfirm', 'HoldToConfirm', 'OtpSlots', 'ReceiptTear', 'SuccessCheck', 'SwipeRow', 'SwipeToast', 'BellToggle', 'SquishSwitch', 'JellyRadio', 'GlideSelect', 'RubberSegment',
  'ScrubField', 'BudgetGauge', 'StatusMark', 'FavouriteHeart', 'PeekRating', 'WarmTooltip', 'PromptBar', 'VoicePill', 'CallChip', 'LatticeLoader'];

describe('group 7', () => {
  it('exports the 69 components', () => {
    expect(G7.length).toBe(69);
    expect(G7.filter((n) => typeof (pack as Record<string, unknown>)[n] !== 'function')).toEqual([]);
  });

  it('every component renders and passes axe', async () => {
    render(
      <div>
        <RollingDigits value={1250.5} currency="USD" /><CountUp value={1840.2} currency="USD" /><SplitFlapBoard items={[{ label: 'USD', value: '0.92 EUR' }]} />
        <RevealDigits value="GB29 NWBK 6016 1331 9268 19" /><BlurInText text="Your money, clearly." /><TextReveal text="Welcome back" /><RotatingText prefix="Pay" words={['bills', 'friends']} />
        <ShimmerText text="New offer" /><GradientText text="Platinum" /><TypedText text="You spent 320.00 on groceries." /><FocusWord text="Save a little every day" />
        <ScrollFloatText text="Grow your savings" /><FadeInContent><p>Fade</p></FadeInContent><ScrollReveal><p>Reveal</p></ScrollReveal><ScrollExpand><p>Expand</p></ScrollExpand>
        <EdgeBlur><p>Long list</p></EdgeBlur><GlareHover><p>Card</p></GlareHover><MagneticButton label="Open an account" /><HighlightBorder><p>New</p></HighlightBorder>
        <ClickBurst><p>Tap</p></ClickBurst><Marquee items={['USD 0.92 EUR', 'GBP 1.17 EUR']} /><AnimatedList label="Recent" items={['Coffee House', { title: 'Salary', meta: '31 Dec' }]} />
        <SpotlightCard heading="Platinum card" text="2% cashback" /><TiltCard heading="Savings" /><FlipCard heading="Platinum" front="2% cashback" back="No annual fee in year one" />
        <CardStack items={[{ title: 'Tip 1', text: 'Set a budget' }, { title: 'Tip 2', text: 'Turn on alerts' }]} /><GlowBorderCard heading="Premium" />
        <BentoGrid label="Dashboard" items={[{ id: 'a', title: 'Spending', figure: '1,240.00', size: 'wide' }]} onAction={() => undefined} />
        <Carousel slides={[{ title: 'Travel insurance', text: 'Cover for the whole family' }, { title: 'Home loans' }]} />
        <ElasticSlider testID="es" value={500} /><Controlled initial="6 months">{(v, set) => <OptionWheel label="Tenure" options={['3 months', '6 months', '12 months']} value={v} onChange={set} />}</Controlled>
        <PillNav items={['Accounts', 'Payments']} selection="Accounts" /><DockNav items={[{ id: 'pay', label: 'Pay', icon: '↗' }]} />
        <CardNav items={[{ id: 'loans', title: 'Loans', text: 'Home, car, personal' }]} /><StaggeredMenu items={['Statements', 'Settings']} />
        <DocumentFolder items={[{ id: 'd1', title: 'Statement Dec', meta: 'PDF' }]} /><ScrollStack items={[{ title: 'Step 1', text: 'Choose' }]} />
        <ProfileCard name="Priya Nair" jobTitle="Relationship manager" items={[{ label: 'Phone', value: '+44 20 7946 0123' }]} actionLabel="Send a message" />
        <GlassPanel><p>Glass</p></GlassPanel><GradientBackdrop><p>Hello</p></GradientBackdrop><SoftAurora><p>Hello</p></SoftAurora><SilkBackdrop><p>Hello</p></SilkBackdrop>
        <DotGrid><p>Hello</p></DotGrid><LineWaves><p>Hello</p></LineWaves><LightBeams><p>Hello</p></LightBeams><Topography><p>Hello</p></Topography><ParticleBackdrop><p>Hello</p></ParticleBackdrop>
        <SlideToConfirm /><HoldToConfirm /><OtpSlots value="12" /><ReceiptTear amount={1250} currency="USD" /><SuccessCheck label="Payment sent" />
        <SwipeRow heading="Coffee House" meta="Today" value="-4.50" actions={[{ value: 'dispute', label: 'Dispute', tone: 'danger' }]} /><SwipeToast message="Saved as a payee" />
        <BellToggle value={false} /><SquishSwitch label="Round up to save" value={false} /><JellyRadio label="Card design" value="" options={['Blue', 'Black']} />
        <GlideSelect label="Show" options={['Day', 'Week']} value="Day" /><RubberSegment label="Period" options={['1M', '3M']} value="1M" /><ScrubField value={250} currency="USD" />
        <BudgetGauge label="Groceries" value={320} max={400} unit="USD" /><StatusMark label="Approved" /><FavouriteHeart name="A. Rao" value /><PeekRating value={3} />
        <WarmTooltip label="Reward points" text="Points expire after 2 years." /><PromptBar suggestions={['What did I spend on travel?']} /><VoicePill listening={false} />
        <CallChip number="+44 20 7946 0000" /><LatticeLoader />
      </div>,
    );
    expect(screen.getByText('Your money, clearly.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Call the bank, +44 20 7946 0000' }).getAttribute('href')).toBe('tel:+442079460000');
    expect(screen.getByRole('progressbar', { name: 'Groceries' }).getAttribute('aria-valuetext')).toBe('320 USD of 400 USD');
    expect(await violations()).toEqual([]);
  }, 60000);

  it('count-up and typed text move to the end; under reduced motion they start there', () => {
    vi.useFakeTimers();
    render(<><CountUp testID="c" value={1000} duration={300} /><TypedText testID="t" text="Hi there" speed={20} /></>);
    act(() => { vi.advanceTimersByTime(60); });
    expect(screen.getByTestId('t').textContent?.endsWith('Hi ')).toBe(true);
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByTestId('c').querySelector('[aria-hidden="true"]')?.textContent).toBe((1000).toLocaleString(undefined, { minimumFractionDigits: 2 }));
    expect(screen.getByTestId('t').querySelector('[aria-hidden="true"]')?.textContent).toBe('Hi there');
    cleanup();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<><CountUp testID="c" value={7} /><TypedText testID="t" text="Done" /></>);
    expect([screen.getByTestId('c').querySelector('[aria-hidden="true"]')?.textContent, screen.getByTestId('t').querySelector('[aria-hidden="true"]')?.textContent]).toEqual(['7.00', 'Done']);
  });

  it('rotating text says all the words; reveal digits masks and shows', async () => {
    render(<><RotatingText testID="r" prefix="Pay" words={['bills', 'friends', 'cards']} /><RevealDigits value="GB29 NWBK 6016 1331 9268 19" /></>);
    expect(screen.getByTestId('r').querySelector('.bx-visually-hidden')?.textContent).toBe('Pay bills, friends or cards');
    expect(screen.getByText('•••• 6819', { selector: '.bx-visually-hidden' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show Account number' }));
    expect(screen.getByText('GB29 NWBK 6016 1331 9268 19', { selector: '.bx-visually-hidden' })).toBeTruthy();
  });

  it('slide to confirm: a press confirms, a partial drag does not; hold to confirm needs the full time', async () => {
    const done = vi.fn();
    // jsdom lays nothing out and its pointer events have no position: give them both
    vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId = 1; });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return { width: this.classList.contains('bx-slide-handle') ? 50 : 300, height: 50, left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    });
    render(<SlideToConfirm onConfirm={done} />);
    const handle = screen.getByRole('button', { name: 'Slide to pay: slide, or press to confirm' });
    fireEvent.pointerDown(handle, { clientX: 0 });
    fireEvent.pointerMove(handle, { clientX: 20 });
    fireEvent.pointerUp(handle, { clientX: 20 });
    fireEvent.click(handle);
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(handle);
    expect([done.mock.calls.length, screen.getByRole('status').textContent]).toEqual([1, 'Paid']);
    cleanup();
    vi.useFakeTimers();
    const held = vi.fn();
    render(<HoldToConfirm duration={1000} onConfirm={held} />);
    const b = screen.getByRole('button', { name: 'Hold to confirm' });
    fireEvent.pointerDown(b);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.pointerUp(b);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(held).not.toHaveBeenCalled();
    fireEvent.keyDown(b, { key: ' ' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(held).toHaveBeenCalledTimes(1);
  });

  it('carousel, card stack and flip card go round and hide what is away', async () => {
    render(<><Carousel slides={[{ title: 'One' }, { title: 'Two' }]} /><CardStack items={[{ title: 'A' }, { title: 'B' }]} /><FlipCard heading="Platinum" front="Cashback" back="Fees" /></>);
    await userEvent.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByRole('group', { name: '2 of 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Slide 2' }).getAttribute('aria-current')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Next card' }));
    expect(screen.getByText('Card 2 of 2')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(document.querySelector('.bx-flip-front')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.bx-flip-back')?.getAttribute('aria-hidden')).toBeNull();
  });

  it('swipe row, toggles, prompt bar and voice pill', async () => {
    const act1 = vi.fn();
    const asked = vi.fn();
    render(<><SwipeRow heading="Coffee House" actions={[{ value: 'dispute', label: 'Dispute' }]} onAction={act1} />
      <Controlled initial={false}>{(v, set) => <FavouriteHeart name="A. Rao" value={v} onChange={set} />}</Controlled>
      <PromptBar suggestions={['What did I spend on travel?']} onAsk={asked} />
      <Controlled initial={false}>{(v, set) => <VoicePill listening={v} onListeningChange={set} />}</Controlled></>);
    await userEvent.click(screen.getByRole('button', { name: 'Dispute: Coffee House' }));
    await userEvent.click(screen.getByRole('button', { name: 'Favourite A. Rao' }));
    await userEvent.click(screen.getByRole('button', { name: 'What did I spend on travel?' }));
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Speak' }));
    expect([act1.mock.calls[0][0], screen.getByRole('button', { name: 'Favourite A. Rao' }).getAttribute('aria-pressed'), asked.mock.calls[0][0],
      screen.getByRole('button', { name: 'Listening… press to stop' }).getAttribute('aria-pressed')]).toEqual(['dispute', 'true', 'What did I spend on travel?', 'true']);
  });
});
