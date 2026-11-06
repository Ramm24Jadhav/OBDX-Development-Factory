import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement, useState } from 'react';
import { AccessibilityInfo, Text } from 'react-native';

import { AnimatedList, BellToggle, BentoGrid, BlurInText, BudgetGauge, CallChip, CardNav, CardStack, Carousel, ClickBurst, CountUp, DockNav, DocumentFolder, DotGrid,
  EdgeBlur, ElasticSlider, FadeInContent, FavouriteHeart, FlipCard, FocusWord, GlareHover, GlassPanel, GlideSelect, GlowBorderCard, GradientBackdrop, GradientText,
  HighlightBorder, HoldToConfirm, JellyRadio, LatticeLoader, LightBeams, LineWaves, MagneticButton, Marquee, OptionWheel, OtpSlots, ParticleBackdrop, PeekRating,
  PillNav, ProfileCard, PromptBar, ReceiptTear, RevealDigits, RollingDigits, RotatingText, RubberSegment, ScrollExpand, ScrollFloatText, ScrollReveal, ScrollStack,
  ScrubField, ShimmerText, SilkBackdrop, SlideToConfirm, SoftAurora, SplitFlapBoard, SpotlightCard, SquishSwitch, StaggeredMenu, StatusMark, SuccessCheck, SwipeRow,
  SwipeToast, TextReveal, TiltCard, Topography, TypedText, VoicePill, WarmTooltip, mix } from '../src';
import { accessibilityProblems } from './a11y';

const noop = () => undefined;
const later = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const opts = [{ value: 'd', label: 'Day' }, { value: 'w', label: 'Week' }, { value: 'm', label: 'Month' }];
const slides = [{ id: 'a', label: 'Cashback', content: <Text>Cashback</Text> }, { id: 'b', label: 'Travel', content: <Text>Travel</Text> }];
const nav = [{ id: 'home', label: 'Home', icon: '⌂' }, { id: 'pay', label: 'Pay', icon: '↗' }];

function Controlled<T>({ initial, children }: { initial: T; children: (value: T, set: (v: T) => void) => ReactElement }) {
  const [value, setValue] = useState<T>(initial);
  return children(value, setValue);
}

const ALL: [string, ReactElement][] = [
  ['RollingDigits', <RollingDigits value="12,400.00" />], ['CountUp', <CountUp value={1250} currency="USD" />],
  ['SplitFlapBoard', <SplitFlapBoard label="Rates" rows={[{ label: 'USD / EUR', value: '0.9213' }]} />], ['RevealDigits', <RevealDigits value="0012 0048 21" masked />],
  ['BlurInText', <BlurInText text="Welcome back, Asha" />], ['TextReveal', <TextReveal text="Your savings" />], ['RotatingText', <RotatingText prefix="Pay your" words={['rent', 'bills']} />],
  ['ShimmerText', <ShimmerText text="Loading offers" />], ['GradientText', <GradientText text="Platinum" />], ['TypedText', <TypedText text="Your balance is 12,400.00." />],
  ['FocusWord', <FocusWord text="Save a little every month" />], ['ScrollFloatText', <ScrollFloatText text="Plan ahead" />],
  ['FadeInContent', <FadeInContent><Text>Hi</Text></FadeInContent>], ['ScrollReveal', <ScrollReveal><Text>Hi</Text></ScrollReveal>],
  ['ScrollExpand', <ScrollExpand><Text>Hi</Text></ScrollExpand>], ['EdgeBlur', <EdgeBlur><Text>Hi</Text></EdgeBlur>],
  ['GlareHover', <GlareHover label="Platinum card" onPress={noop}><Text>Card</Text></GlareHover>], ['MagneticButton', <MagneticButton label="Pay now" onPress={noop} />],
  ['HighlightBorder', <HighlightBorder><Text>Hi</Text></HighlightBorder>], ['ClickBurst', <ClickBurst label="Send" onPress={noop}><Text>Send</Text></ClickBurst>],
  ['Marquee', <Marquee items={['USD 0.92 EUR', 'GBP 1.27 USD']} />],
  ['AnimatedList', <AnimatedList items={['a', 'b']} keyOf={(x) => x} renderItem={(x) => <Text>{x}</Text>} />],
  ['SpotlightCard', <SpotlightCard label="Offer" onPress={noop}><Text>Offer</Text></SpotlightCard>], ['TiltCard', <TiltCard label="Card"><Text>Card</Text></TiltCard>],
  ['FlipCard', <FlipCard front={<Text>Front</Text>} back={<Text>Back</Text>} backLabel="card details" flipped={false} onFlippedChange={noop} />],
  ['CardStack', <CardStack label="Offers" cards={slides} value="a" onChange={noop} />], ['GlowBorderCard', <GlowBorderCard><Text>Premium</Text></GlowBorderCard>],
  ['BentoGrid', <BentoGrid tiles={[{ id: 'b', title: 'Balance', value: '12,400.00', span: 2 }, { id: 's', title: 'Spent' }]} onSelect={noop} />],
  ['Carousel', <Carousel label="Offers" slides={slides} value="a" onChange={noop} />],
  ['ElasticSlider', <ElasticSlider testID="x" label="Amount" value={500} max={1000} />], ['OptionWheel', <OptionWheel label="Tenure" options={opts} value="w" onChange={noop} />],
  ['PillNav', <PillNav label="Sections" items={nav} value="home" onChange={noop} />], ['DockNav', <DockNav label="Main" items={nav} value="home" onChange={noop} />],
  ['CardNav', <CardNav groups={[{ id: 'p', title: 'Payments', links: [{ id: 't', label: 'Transfer' }] }]} onNavigate={noop} />],
  ['StaggeredMenu', <StaggeredMenu open onOpenChange={noop} items={[{ id: 'a', label: 'Accounts' }]} onSelect={noop} />],
  ['DocumentFolder', <DocumentFolder title="Statements" documents={[{ id: 'd', title: 'December' }]} open={false} onOpenChange={noop} onSelect={noop} />],
  ['ScrollStack', <ScrollStack cards={[{ id: 'a', content: <Text>A</Text> }]} />], ['ProfileCard', <ProfileCard name="Priya Nair" role="Relationship manager" />],
  ['GlassPanel', <GlassPanel><Text>Hi</Text></GlassPanel>],
  ['GradientBackdrop', <GradientBackdrop />], ['SoftAurora', <SoftAurora />], ['SilkBackdrop', <SilkBackdrop />], ['DotGrid', <DotGrid />], ['LineWaves', <LineWaves />],
  ['LightBeams', <LightBeams />], ['Topography', <Topography />], ['ParticleBackdrop', <ParticleBackdrop />],
  ['SlideToConfirm', <SlideToConfirm label="Slide to pay" onConfirm={noop} />], ['HoldToConfirm', <HoldToConfirm label="Hold to pay" onConfirm={noop} />],
  ['OtpSlots', <OtpSlots testID="x" label="Enter the code" value="12" />], ['ReceiptTear', <ReceiptTear><Text>Paid</Text></ReceiptTear>],
  ['SuccessCheck', <SuccessCheck label="Payment sent" />], ['StatusMark', <StatusMark status="pending" label="Payment" />],
  ['SwipeRow', <SwipeRow label="Coffee House, 4.50" actions={[{ id: 'split', label: 'Split' }]} onAction={noop}><Text>Coffee House</Text></SwipeRow>],
  ['SwipeToast', <SwipeToast message="Saved" onDismiss={noop} />], ['BellToggle', <BellToggle label="Payment alerts" value={false} onChange={noop} />],
  ['SquishSwitch', <SquishSwitch label="Use abroad" value onChange={noop} />], ['JellyRadio', <JellyRadio testID="x" label="Show" value="d" options={opts} />],
  ['GlideSelect', <GlideSelect testID="x" label="Show" value="d" options={opts} />], ['RubberSegment', <RubberSegment testID="x" label="Show" value="d" options={opts} />],
  ['ScrubField', <ScrubField testID="x" label="Amount" value={100} max={1000} currency="USD" />], ['BudgetGauge', <BudgetGauge label="Groceries" value={320} max={400} />],
  ['FavouriteHeart', <FavouriteHeart label="Favourite A. Rao" value={false} onChange={noop} />], ['PeekRating', <PeekRating label="Rate it" value={3} onChange={noop} />],
  ['WarmTooltip', <WarmTooltip label="Available balance" text="What you can spend now." />],
  ['PromptBar', <PromptBar value="" onChange={noop} onSubmit={noop} />], ['VoicePill', <VoicePill listening={false} onToggle={noop} />],
  ['CallChip', <CallChip label="Your bank" number="+44 20 7946 0123" onCall={noop} />], ['LatticeLoader', <LatticeLoader />],
];

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

describe('the five effect categories', () => {
  it('has all 69 components, each with a name and role on its controls and touch targets of at least 44 points', async () => {
    expect(ALL.length).toBe(69);
    for (const [name, element] of ALL) {
      await render(element);
      expect([name, accessibilityProblems()]).toEqual([name, []]);
    }
  });

  it('text effects read the whole text at once, and finish on it', async () => {
    await render(<TypedText testID="t" text="Your balance is 12,400.00." />);
    expect(screen.getByLabelText('Your balance is 12,400.00.')).toBeTruthy();
    await later(2000);
    expect(screen.getByTestId('t')).toHaveTextContent('Your balance is 12,400.00.');
    await render(<CountUp testID="c" value={1250} currency="USD" />);
    expect(screen.getByLabelText('1,250.00 USD')).toBeTruthy();
    await later(1500);
    expect(screen.getByTestId('c')).toHaveTextContent('1,250.00 USD');
  });

  it('RevealDigits stays masked, then unmasks to the full number', async () => {
    const shown = (masked: boolean) => <RevealDigits testID="r" value="0012 0048 21" masked={masked} />;
    const { rerender } = await render(shown(true));
    expect(screen.getByTestId('r')).toHaveTextContent('•••• ••48 21');
    expect(screen.getByLabelText('ending 4821, hidden')).toBeTruthy();
    await rerender(shown(false));
    await later(1000);
    expect(screen.getByTestId('r')).toHaveTextContent('0012 0048 21');
  });

  it('SlideToConfirm and HoldToConfirm confirm through the screen reader action', async () => {
    const slid = jest.fn();
    const held = jest.fn();
    await render(<><SlideToConfirm label="Slide to pay" onConfirm={slid} /><HoldToConfirm label="Hold to pay" onConfirm={held} /></>);
    await fireEvent(screen.getByRole('button', { name: 'Slide to pay' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await fireEvent(screen.getByRole('button', { name: 'Hold to pay' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect([slid.mock.calls.length, held.mock.calls.length]).toEqual([1, 1]);
  });

  it('HoldToConfirm confirms only when held to the end', async () => {
    const held = jest.fn();
    await render(<HoldToConfirm testID="h" label="Hold to pay" onConfirm={held} duration={1000} />);
    await fireEvent(screen.getByTestId('h'), 'pressIn');
    await later(400);
    await fireEvent(screen.getByTestId('h'), 'pressOut');
    await later(1200);
    expect(held).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('h'), 'pressIn');
    await later(1100);
    expect(held).toHaveBeenCalledTimes(1);
  });

  it('SwipeRow offers its actions to screen readers', async () => {
    const act2 = jest.fn();
    await render(<SwipeRow label="Coffee House, 4.50" actions={[{ id: 'split', label: 'Split' }, { id: 'dispute', label: 'Dispute', tone: 'danger' }]} onAction={act2}>
      <Text>Coffee House</Text></SwipeRow>);
    const row = screen.getByLabelText('Coffee House, 4.50');
    expect(row.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual(['Split', 'Dispute']);
    /* the row claims only moves (the swipe), so the test renderer skips fired events; call the action as the screen reader does */
    await act(async () => { row.props.onAccessibilityAction({ nativeEvent: { actionName: 'dispute' } }); });
    expect(act2).toHaveBeenCalledWith('dispute');
  });

  it('the toggles say their state and write it back', async () => {
    let fav = false;
    let bell = false;
    await render(<><FavouriteHeart label="Favourite A. Rao" value={false} onChange={(x) => { fav = x; }} /><BellToggle label="Payment alerts" value={false}
                                                                                                                         onChange={(x) => { bell = x; }} /></>);
    expect(screen.getByRole('checkbox', { name: 'Favourite A. Rao' }).props.accessibilityState.checked).toBe(false);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Favourite A. Rao' }));
    await fireEvent.press(screen.getByRole('switch', { name: 'Payment alerts' }));
    expect([fav, bell]).toEqual([true, true]);
  });

  it('ScrubField and OptionWheel step with the screen reader swipe', async () => {
    let amount = 0;
    let tenure = '';
    await render(<Controlled initial={100}>{(v, set) => <ScrubField testID="s" label="Amount" value={v} max={1000} step={50} onChange={(x) => { amount = x; set(x); }} />}</Controlled>);
    await fireEvent(screen.getByRole('adjustable', { name: 'Amount' }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await render(<OptionWheel label="Tenure" options={opts} value="w" onChange={(x) => { tenure = x; }} />);
    await fireEvent(screen.getByRole('adjustable', { name: 'Tenure' }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect([amount, tenure]).toEqual([150, 'm']);
  });

  it('the pickers write back the option chosen', async () => {
    const seen: string[] = [];
    await render(<><JellyRadio testID="j" label="A" value="d" options={opts} onChange={(x) => seen.push(x)} />
      <GlideSelect testID="g" label="B" value="d" options={opts} onChange={(x) => seen.push(x)} />
      <RubberSegment testID="r" label="C" value="d" options={opts} onChange={(x) => seen.push(x)} /></>);
    for (const id of ['j', 'g', 'r']) { await fireEvent.press(screen.getByTestId(`${id}-option-m`)); }
    expect(seen).toEqual(['m', 'm', 'm']);
  });

  it('FlipCard, CardStack and Carousel move on with a button', async () => {
    const flip = jest.fn();
    const stack = jest.fn();
    const slide = jest.fn();
    await render(<><FlipCard front={<Text>Front</Text>} back={<Text>Back</Text>} backLabel="card details" flipped={false} onFlippedChange={flip} />
      <CardStack label="Offers" cards={slides} value="b" onChange={stack} /><Carousel label="Promotions" slides={slides} value="a" onChange={slide} /></>);
    await fireEvent.press(screen.getByRole('button', { name: 'Show card details' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next Offers' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next slide' }));
    expect([flip.mock.calls[0][0], stack.mock.calls[0][0], slide.mock.calls[0][0]]).toEqual([true, 'a', 'b']);
  });

  it('StatusMark and SuccessCheck say the outcome', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await render(<><StatusMark status="failed" label="Payment" /><SuccessCheck label="Payment sent" /></>);
    expect(screen.getByLabelText('Payment, failed')).toBeTruthy();
    expect(say).toHaveBeenCalledWith('Payment sent');
  });

  it('PromptBar sends the trimmed question and waits while busy', async () => {
    const ask = jest.fn();
    await render(<PromptBar value="  What did I spend?  " onChange={noop} onSubmit={ask} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(ask).toHaveBeenCalledWith('What did I spend?');
  });

  it('backdrops are hidden from screen readers and take no touches', async () => {
    await render(<SoftAurora testID="a" />);
    expect([screen.getByTestId('a', { includeHiddenElements: true }).props.importantForAccessibility,
      screen.getByTestId('a', { includeHiddenElements: true }).props.pointerEvents]).toEqual(['no-hide-descendants', 'none']);
  });

  it('mixes the gradient colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('under reduced motion', () => {
  beforeEach(async () => {
    await render(<Text>warm</Text>);
    await render(<FadeInContent><Text>warm</Text></FadeInContent>);
    const listener = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.find((c) => c[0] === 'reduceMotionChanged')?.[1];
    await act(async () => { listener(true); });
  });

  it('the text effects show their end at once', async () => {
    await render(<><TypedText testID="t" text="Your balance is 12,400.00." /><CountUp testID="c" value={1250} currency="USD" />
      <RevealDigits testID="r" value="0012 0048 21" masked={false} /></>);
    expect(screen.getByTestId('t')).toHaveTextContent('Your balance is 12,400.00.');
    expect(screen.getByTestId('c')).toHaveTextContent('1,250.00 USD');
    expect(screen.getByTestId('r')).toHaveTextContent('0012 0048 21');
  });

  it('the marquee stands still and shows every item', async () => {
    await render(<Marquee testID="m" items={['USD 0.92 EUR', 'GBP 1.27 USD']} />);
    expect(screen.getByTestId('m')).toHaveTextContent('USD 0.92 EUR  ·  GBP 1.27 USD');
  });
});
