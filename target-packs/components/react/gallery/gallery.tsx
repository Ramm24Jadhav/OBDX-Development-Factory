/*
 * The gallery the browser gates run on: every foundation component in its main states, one <section
 * data-component="id"> each, in the theme the URL asks for (?mode=light|dark). Fixed data so screenshots are stable.
 */
import { ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../src/bx.css';
import { Accordion, AccountBalance, AccountCard, AccountDetails, AccountNumber, AccountSelector, AccountStructure, AccountSummary, AccountsWidget, ActionMenu, ActivateCard, AddOnCard, Alert, AlertSubscriptions, AmountInput, AnimatedList, Appearance, ApplicationTracker, ApprovalDetail, ApprovalJourney, ApprovalQueue, AuthChallenge, Autocomplete, Avatar, BellToggle, BeneficiaryCard, BeneficiarySelector, BentoGrid, BillsWidget, BlockCard, BlurInText, Breadcrumb, BudgetGauge, BudgetsWidget, BulkUploadWidget, Button, CalculatorsWidget, CallChip, Card, CardControls, CardLimits, CardList, CardNav, CardStack, CardStatements, CardTile, Carousel, Certificates, CheckboxGroup, ClickBurst, CodeDelivery, ComposeMessage, Consents, ConvertToEmi, CorporateLimitsWidget, CountUp, CreditCardsWidget, CreditLineWidget, CreditScoreWidget, CurrencyPositionWidget, CurrencySelector, DataTable, DatePicker, DateRangePicker, DelinquencyNotice, DepositCalculator, DepositRedemption, DepositTopUp, DepositsSummary, DestructiveButton, Devices, Dialog, DisbursementTimeline, Divider, DoNotDisturb, DockNav, DocumentFolder, DotGrid, Dropdown, EReceipts, EdgeBlur, ElasticSlider, EligibilityCalculator, EmptyState, ErrorMessage, FadeInContent, Faq, FavouriteHeart, FeedbackRating, FileUpload, FilterChips, FinancialAdvisorWidget, FinancialOverviewWidget, FlipCard, FocusWord, ForexCalculator, FraudAlert, GlareHover, GlassPanel, GlideSelect, GlowBorderCard, GoalCalculator, GoalsWidget, GradientBackdrop, GradientText, Grid, HighlightBorder, HoldToConfirm, IconButton, JellyRadio, KycSteps, LanguagePicker, LastPaymentsWidget, LatticeLoader, LendLimits, LightBeams, LineWaves, LiveChat, LoanCalculator, LoanRepayment, LoansSummary, LoansWidget, Locator, MagneticButton, Mailbox, Marquee, MaturityInstructions, ModificationNotice, MultiSelect, MyLimitsWidget, NewDepositForm, Nominations, NotificationPanel, NotificationsWidget, NumberInput, OptionWheel, OtpInput, OtpSlots, OverviewWidget, Pagination, ParticleBackdrop, PasswordField, PaymentForm, PaymentSchedule, PaymentStatus, PeekRating, PendingActionWidget, PendingApprovalsWidget, PendingRelease, PillNav, ProductCard, Profile, ProfileCard, ProgressBar, PromiseToPay, PromptBar, QuickActions, QuickInsightsWidget, QuickLinksWidget, RadioGroup, RaiseDispute, RaiseRequest, ReceiptTear, RecentTransactionsWidget, RedeemPoints, RepaymentSchedule, ReportsWidget, Reroute, ResetPin, RevealDigits, RewardsWidget, RollingDigits, RotatingText, RubberSegment, SavingsGoal, ScrollExpand, ScrollFloatText, ScrollReveal, ScrollStack, ScrubField, SearchField, SecondaryButton, SecureConfirmation, SelfRegister, SensitiveField, SessionExpiryWarning, SessionSummary, Sheet, ShimmerText, SideNav, SignInOptions, SilkBackdrop, Skeleton, SlideToConfirm, Slider, SoftAurora, SpecialOffersWidget, SpendAnalysisWidget, SpendCategories, SpendingChart, Spinner, SplitFlapBoard, SpotlightCard, SquishSwitch, StaggeredMenu, StatementFormat, StatementRequest, StatusBadge, StatusMark, Stepper, StructureSimulation, StructureType, SuccessCheck, SuccessMessage, SweepMonitor, SwipeRow, SwipeToast, Tabs, TaxSelfCertification, TermsConsent, TextArea, TextField, TextReveal, TiltCard, Timeline, Toast, Toggle, ToggleGroup, Tooltip, Topography, TrackRequests, TradeBillsWidget, TradeInstrumentsWidget, TransactionDetails, TransactionFilter, TransactionHistory, TransactionLimits, TransactionReceipt, TransactionsWidget, TransferSummary, TypedText, UpcomingBills, VoicePill, WarmTooltip, WorkSnapshotWidget, styleClasses, type ComponentStyle } from '../src';
import './gallery.css';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
// The factory's Component factory shows one section (?only=id) in the design and motion its card has chosen
const only = params.get('only');
// ?variant= also draws each component's variants (variants/v1.json): the factory card and the variant gates ask for one
const variantsShown = params.has('variant');
const look = (params.get('look') || 'elevated') as ComponentStyle['look'];
const motion = { hover: params.get('hover') || undefined, click: params.get('click') || undefined, scroll: params.get('scroll') || undefined } as ComponentStyle['motion'];
const accounts = [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }];
const rows = [
  { id: 't1', date: '12 Nov 2026', text: 'Electricity bill', amount: -1240 },
  { id: 't2', date: '11 Nov 2026', text: 'Salary', amount: 85000 },
  { id: 't3', date: '09 Nov 2026', text: 'Card payment', amount: -3499 },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  if (only && only !== id) { return null; }
  return (
    <section className="gate" data-component={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      <div className="gate-body">{children}</div>
    </section>
  );
}

function Gallery() {
  const [name, setName] = useState('A. Sharma');
  const [amount, setAmount] = useState<number | null>(1250);
  const [account, setAccount] = useState('S');
  const [alerts, setAlerts] = useState(['E']);
  const [speed, setSpeed] = useState('N');
  const [day, setDay] = useState('2026-11-12');
  const [tab, setTab] = useState('c');
  const [selected, setSelected] = useState<string[]>(['t2']);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [bulk, setBulk] = useState<File[]>([]);
  const [message, setMessage] = useState(''); const [format, setFormat] = useState('PDF'); const [terms, setTerms] = useState<string[]>([]); const [income, setIncome] = useState(6000); const [stars, setStars] = useState(0); const places = [{ id: 'b1', name: 'London Bridge', type: 'branch', address: '1 Tooley St', distance: '0.4 km', hours: 'Open until 17:00' }, { id: 'a1', name: 'Borough ATM', type: 'atm', address: 'Borough High St', distance: '0.7 km' }] as const; const chat = [{ id: 'm1', from: 'agent', name: 'Priya', text: 'Hello, how can I help?', time: '10:02' }, { id: 'm2', from: 'customer', text: 'My card is stuck in an ATM.', time: '10:03' }] as const;
  const [cats, setCats] = useState<string[]>([]); const [structure, setStructure] = useState('Sweep'); const [signIn, setSignIn] = useState(['Passkey']); const [codesBy, setCodesBy] = useState('SMS'); const [theme, setTheme] = useState('System'); const [lang, setLang] = useState('en'); const [quiet, setQuiet] = useState(true); const [reroute, setReroute] = useState(''); const languages = [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }, { value: 'fr', label: 'Français' }, { value: 'es', label: 'Español' }]; const approvers = [{ value: 'fh', label: 'Finance head' }, { value: 'tr', label: 'Treasury' }, { value: 'cfo', label: 'CFO' }];
  const [code, setCode] = useState(''); const [pin, setPin] = useState(''); const [controls, setControls] = useState(['Online payments']); const [blocked, setBlocked] = useState(false); const [emi, setEmi] = useState('6 months'); const [points, setPoints] = useState(5000); const [limit, setLimit] = useState(2000); const [timeout, setTimeoutOpen] = useState(false);
  const [iban, setIban] = useState('GB29NWBK60161331926819'); const [txFilter, setTxFilter] = useState<string[]>([]); const [repeat, setRepeat] = useState('Once'); const [maturity, setMaturity] = useState(''); const payees = [{ id: 'p1', name: 'A. Rao', meta: 'HSBC ·· 9268' }, { id: 'p2', name: 'J. Mehta', meta: 'Barclays ·· 1180' }]; const txns = [{ id: 't1', description: 'Coffee House', date: 'Today 08:14', amount: -4.5 }, { id: 't2', description: 'Salary', date: '31 Dec', amount: 3200 }, { id: 't3', description: 'Electricity', date: '28 Dec', amount: -86.2 }]; const bills = [{ id: 'b1', title: 'Electricity', meta: 'Due 20 Jan', value: '86.20' }, { id: 'b2', title: 'Card ·· 4821', meta: 'Due 18 Jan', value: '640.00' }];
  const [saving, setSaving] = useState(5000); const [show, setShow] = useState('Week'); const [filters, setFilters] = useState(['Card']); const [navSel, setNavSel] = useState('Accounts'); const [sheet, setSheet] = useState(false); const [page, setPage] = useState(2); const faq = [{ id: 'a', title: 'How long does a transfer take?', body: 'Same day inside the bank; up to 2 working days to other banks.' }, { id: 'b', title: 'Can I cancel a payment?', body: 'Yes, until it is sent.' }]; const notes = [{ id: 'n1', title: 'Card payment due', meta: 'Due 18 Jan', value: '640.00', unread: true }, { id: 'n2', title: 'New statement ready', meta: 'Today', value: 'Dec' }];
  const [remarks, setRemarks] = useState('Rent for November');
  const [secret, setSecret] = useState('s3cret-pass');
  const [copies, setCopies] = useState<number | null>(2);
  const [currency, setCurrency] = useState('INR');
  const [picked, setPicked] = useState(['S']);
  const [paperless, setPaperless] = useState(true);
  const [period, setPeriod] = useState({ from: '2026-10-01', to: '2026-10-31' });
  const [query, setQuery] = useState('rent');
  const [payee, setPayee] = useState('P1');
  const [proof, setProof] = useState(() => [new File([new Uint8Array(248000)], 'statement-october.pdf', { type: 'application/pdf' })]);
  return (
    <main className={styleClasses({ look, mode, motion }) + ' gallery'} data-gallery-ready>
      <h1>obdx-react foundation set</h1>
      <Section id="button" title="Button">
        <div className="gate-row">
          <Button label="Pay now" />
          <Button label="Save draft" chroming="solid" />
          <Button label="Cancel" chroming="outlined" />
          <Button label="Details" chroming="borderless" />
          <Button label="Delete" chroming="danger" />
          <Button label="Paying" busy />
        </div>
        {variantsShown ? <>
          <div data-variant="material"><Button variant="material" label="Pay now" /></div>
          <div data-variant="tonal"><Button variant="tonal" label="Pay now" /></div>
          <div data-variant="outlined"><Button variant="outlined" label="Pay now" /></div>
          <div data-variant="text"><Button variant="text" label="Pay now" /></div>
          <div data-variant="elevated"><Button variant="elevated" label="Pay now" /></div>
          <div data-variant="gradient"><Button variant="gradient" label="Pay now" /></div>
          <div data-variant="glass"><Button variant="glass" label="Pay now" /></div>
          <div data-variant="pill"><Button variant="pill" label="Pay now" /></div>
        </> : null}
      </Section>
      <Section id="icon-button" title="Icon button">
        <div className="gate-row"><IconButton label="More actions" /><IconButton label="Close" icon="close" chroming="outlined" /><IconButton label="Disabled action" disabled /></div>
        {variantsShown ? <>
          <div data-variant="material"><IconButton variant="material" label="More actions" /></div>
          <div data-variant="filled"><IconButton variant="filled" label="More actions" /></div>
          <div data-variant="tonal"><IconButton variant="tonal" label="More actions" /></div>
          <div data-variant="outlined"><IconButton variant="outlined" label="More actions" /></div>
          <div data-variant="circular"><IconButton variant="circular" label="More actions" /></div>
          <div data-variant="square"><IconButton variant="square" label="More actions" /></div>
        </> : null}
      </Section>
      <Section id="text-field" title="Text field">
        <TextField testID="tf1" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" />
        <TextField testID="tf2" label="Reference" value="INV 2041" error="Use letters and numbers only." />
        <TextField testID="tf3" label="Customer ID" value="CUST-00921" readOnly />
        {variantsShown ? <>
          <div data-variant="material"><TextField variant="material" testID="tf1-material" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" /></div>
          <div data-variant="outlined"><TextField variant="outlined" testID="tf1-outlined" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" /></div>
          <div data-variant="underlined"><TextField variant="underlined" testID="tf1-underlined" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" /></div>
          <div data-variant="floating"><TextField variant="floating" testID="tf1-floating" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" /></div>
          <div data-variant="inline"><TextField variant="inline" testID="tf1-inline" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" /></div>
          <div data-variant="pill"><TextField variant="pill" testID="tf1-pill" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" /></div>
        </> : null}
      </Section>
      <Section id="amount" title="Amount input">
        <AmountInput testID="am1" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" />
        <AmountInput testID="am2" label="Amount" currency="KWD" locale="en-US" value={12.5} error="Enter at most 10.000." />
        {variantsShown ? <>
          <div data-variant="material"><AmountInput variant="material" testID="am1-material" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" /></div>
          <div data-variant="outlined"><AmountInput variant="outlined" testID="am1-outlined" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" /></div>
          <div data-variant="underlined"><AmountInput variant="underlined" testID="am1-underlined" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" /></div>
          <div data-variant="floating"><AmountInput variant="floating" testID="am1-floating" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" /></div>
          <div data-variant="inline"><AmountInput variant="inline" testID="am1-inline" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" /></div>
          <div data-variant="pill"><AmountInput variant="pill" testID="am1-pill" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" /></div>
        </> : null}
      </Section>
      <Section id="select" title="Dropdown">
        <Dropdown testID="dd1" label="From account" options={accounts} value={account} onChange={setAccount} required />
        <Dropdown testID="dd2" label="To account" options={accounts} value="" disabled />
        {variantsShown ? <>
          <div data-variant="material"><Dropdown variant="material" testID="dd1-material" label="From account" options={accounts} value={account} onChange={setAccount} required /></div>
          <div data-variant="outlined"><Dropdown variant="outlined" testID="dd1-outlined" label="From account" options={accounts} value={account} onChange={setAccount} required /></div>
          <div data-variant="underlined"><Dropdown variant="underlined" testID="dd1-underlined" label="From account" options={accounts} value={account} onChange={setAccount} required /></div>
          <div data-variant="inline"><Dropdown variant="inline" testID="dd1-inline" label="From account" options={accounts} value={account} onChange={setAccount} required /></div>
          <div data-variant="pill"><Dropdown variant="pill" testID="dd1-pill" label="From account" options={accounts} value={account} onChange={setAccount} required /></div>
        </> : null}
      </Section>
      <Section id="checkbox-group" title="Checkbox group">
        <CheckboxGroup testID="cg" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }]}
                       value={alerts} onChange={setAlerts} />
        {variantsShown ? <>
          <div data-variant="material"><CheckboxGroup variant="material" testID="cg-material" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }]}
                       value={alerts} onChange={setAlerts} /></div>
          <div data-variant="cards"><CheckboxGroup variant="cards" testID="cg-cards" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }]}
                       value={alerts} onChange={setAlerts} /></div>
          <div data-variant="chips"><CheckboxGroup variant="chips" testID="cg-chips" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }]}
                       value={alerts} onChange={setAlerts} /></div>
          <div data-variant="rows"><CheckboxGroup variant="rows" testID="cg-rows" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }]}
                       value={alerts} onChange={setAlerts} /></div>
          <div data-variant="round"><CheckboxGroup variant="round" testID="cg-round" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }]}
                       value={alerts} onChange={setAlerts} /></div>
        </> : null}
      </Section>
      <Section id="choice-group" title="Radio group">
        <RadioGroup testID="rg" label="Transfer speed" horizontal options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }]}
                    value={speed} onChange={setSpeed} />
        {variantsShown ? <>
          <div data-variant="material"><RadioGroup variant="material" testID="rg-material" label="Transfer speed" horizontal options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }]}
                    value={speed} onChange={setSpeed} /></div>
          <div data-variant="cards"><RadioGroup variant="cards" testID="rg-cards" label="Transfer speed" horizontal options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }]}
                    value={speed} onChange={setSpeed} /></div>
          <div data-variant="chips"><RadioGroup variant="chips" testID="rg-chips" label="Transfer speed" horizontal options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }]}
                    value={speed} onChange={setSpeed} /></div>
          <div data-variant="rows"><RadioGroup variant="rows" testID="rg-rows" label="Transfer speed" horizontal options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }]}
                    value={speed} onChange={setSpeed} /></div>
        </> : null}
      </Section>
      <Section id="date" title="Date picker">
        <DatePicker testID="dp" label="Pay on" value={day} onChange={setDay} min="2026-11-10" max="2026-12-31" locale="en-GB" />
        {variantsShown ? <>
          <div data-variant="material"><DatePicker variant="material" testID="dp-material" label="Pay on" value={day} onChange={setDay} min="2026-11-10" max="2026-12-31" locale="en-GB" /></div>
          <div data-variant="outlined"><DatePicker variant="outlined" testID="dp-outlined" label="Pay on" value={day} onChange={setDay} min="2026-11-10" max="2026-12-31" locale="en-GB" /></div>
          <div data-variant="underlined"><DatePicker variant="underlined" testID="dp-underlined" label="Pay on" value={day} onChange={setDay} min="2026-11-10" max="2026-12-31" locale="en-GB" /></div>
          <div data-variant="inline"><DatePicker variant="inline" testID="dp-inline" label="Pay on" value={day} onChange={setDay} min="2026-11-10" max="2026-12-31" locale="en-GB" /></div>
        </> : null}
      </Section>
      <Section id="dialog" title="Dialog">
        <div className="gate-dialog" ref={setHost}>
          {host ? (
            <Dialog open onOpenChange={() => undefined} container={host} title="Delete A. Sharma?" description="You can add them again later."
                    footer={<><Button label="Cancel" chroming="outlined" /><Button label="Delete" chroming="danger" /></>}>
              <p>Payments scheduled to A. Sharma will stop.</p>
            </Dialog>
          ) : null}
        </div>
      </Section>
      <Section id="toast" title="Toast">
        <Toast display="general" onClose={() => undefined} messages={[
          { id: '1', severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.', autoTimeout: 0 },
          { id: '2', severity: 'confirmation', summary: 'Beneficiary added', autoTimeout: 0 },
          { id: '3', severity: 'warning', summary: 'Your session ends in 2 minutes', autoTimeout: 0 },
        ]} />
      </Section>
      <Section id="card" title="Card">
        <div className="gate-row">
          <Card heading="Savings •••• 4521" subheading="Available balance">₹85,000.00</Card>
          <Card heading="Current •••• 0187" subheading="Open the account" onAction={() => undefined} selected={false}>₹12,410.50</Card>
        </div>
      </Section>
      <Section id="tabs" title="Tabs">
        <Tabs label="Accounts" selection={tab} onSelectionChange={setTab} tabs={[
          { id: 'c', label: 'Current', content: <p>2 current accounts</p> }, { id: 's', label: 'Savings', content: <p>1 savings account</p> },
          { id: 'd', label: 'Deposits', content: <p>3 deposits</p> }, { id: 'l', label: 'Loans', disabled: true }]} />
      </Section>
      <Section id="data-grid" title="Data table">
        <DataTable caption="Recent transactions" rows={rows} keyField="id" selectionMode="multiple" selected={selected} onSelectedChange={setSelected} columns={[
          { field: 'date', headerText: 'Date', sortable: true }, { field: 'text', headerText: 'Description' },
          { field: 'amount', headerText: 'Amount', sortable: true, align: 'end', render: (r) => r.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) }]} />
      </Section>
      <Section id="text-area" title="Text area">
        <TextArea testID="ta1" label="Remarks" value={remarks} onChange={setRemarks} maxLength={140} helpText="Shown on the payee's statement" />
        <TextArea testID="ta2" label="Reason" value="" required error="Say why you are cancelling." />
        {variantsShown ? <>
          <div data-variant="material"><TextArea variant="material" testID="ta1-material" label="Remarks" value={remarks} onChange={setRemarks} maxLength={140} helpText="Shown on the payee's statement" /></div>
          <div data-variant="outlined"><TextArea variant="outlined" testID="ta1-outlined" label="Remarks" value={remarks} onChange={setRemarks} maxLength={140} helpText="Shown on the payee's statement" /></div>
          <div data-variant="underlined"><TextArea variant="underlined" testID="ta1-underlined" label="Remarks" value={remarks} onChange={setRemarks} maxLength={140} helpText="Shown on the payee's statement" /></div>
          <div data-variant="floating"><TextArea variant="floating" testID="ta1-floating" label="Remarks" value={remarks} onChange={setRemarks} maxLength={140} helpText="Shown on the payee's statement" /></div>
          <div data-variant="inline"><TextArea variant="inline" testID="ta1-inline" label="Remarks" value={remarks} onChange={setRemarks} maxLength={140} helpText="Shown on the payee's statement" /></div>
        </> : null}
      </Section>
      <Section id="password" title="Password">
        <PasswordField testID="pw1" label="Password" value={secret} onChange={setSecret} autoComplete="new-password" helpText="At least 8 characters, one number" />
        <PasswordField testID="pw2" label="Transaction PIN" value="1234" error="The PIN is wrong. 2 tries left." autoComplete="one-time-code" />
        {variantsShown ? <>
          <div data-variant="material"><PasswordField variant="material" testID="pw1-material" label="Password" value={secret} onChange={setSecret} autoComplete="new-password" helpText="At least 8 characters, one number" /></div>
          <div data-variant="outlined"><PasswordField variant="outlined" testID="pw1-outlined" label="Password" value={secret} onChange={setSecret} autoComplete="new-password" helpText="At least 8 characters, one number" /></div>
          <div data-variant="underlined"><PasswordField variant="underlined" testID="pw1-underlined" label="Password" value={secret} onChange={setSecret} autoComplete="new-password" helpText="At least 8 characters, one number" /></div>
          <div data-variant="floating"><PasswordField variant="floating" testID="pw1-floating" label="Password" value={secret} onChange={setSecret} autoComplete="new-password" helpText="At least 8 characters, one number" /></div>
          <div data-variant="inline"><PasswordField variant="inline" testID="pw1-inline" label="Password" value={secret} onChange={setSecret} autoComplete="new-password" helpText="At least 8 characters, one number" /></div>
        </> : null}
      </Section>
      <Section id="number-input" title="Number">
        <NumberInput testID="ni1" label="Cheque leaves" value={copies} onChange={setCopies} min={1} max={5} helpText="Up to 5 books" />
        <NumberInput testID="ni2" label="Tenure (months)" value={84} error="Enter 60 or less." />
        {variantsShown ? <>
          <div data-variant="material"><NumberInput variant="material" testID="ni1-material" label="Cheque leaves" value={copies} onChange={setCopies} min={1} max={5} helpText="Up to 5 books" /></div>
          <div data-variant="outlined"><NumberInput variant="outlined" testID="ni1-outlined" label="Cheque leaves" value={copies} onChange={setCopies} min={1} max={5} helpText="Up to 5 books" /></div>
          <div data-variant="underlined"><NumberInput variant="underlined" testID="ni1-underlined" label="Cheque leaves" value={copies} onChange={setCopies} min={1} max={5} helpText="Up to 5 books" /></div>
          <div data-variant="floating"><NumberInput variant="floating" testID="ni1-floating" label="Cheque leaves" value={copies} onChange={setCopies} min={1} max={5} helpText="Up to 5 books" /></div>
          <div data-variant="inline"><NumberInput variant="inline" testID="ni1-inline" label="Cheque leaves" value={copies} onChange={setCopies} min={1} max={5} helpText="Up to 5 books" /></div>
          <div data-variant="pill"><NumberInput variant="pill" testID="ni1-pill" label="Cheque leaves" value={copies} onChange={setCopies} min={1} max={5} helpText="Up to 5 books" /></div>
        </> : null}
      </Section>
      <Section id="currency-picker" title="Currency">
        <CurrencySelector testID="cp1" label="Currency" value={currency} onChange={setCurrency} required />
        {variantsShown ? <>
          <div data-variant="material"><CurrencySelector variant="material" testID="cp1-material" label="Currency" value={currency} onChange={setCurrency} required /></div>
          <div data-variant="outlined"><CurrencySelector variant="outlined" testID="cp1-outlined" label="Currency" value={currency} onChange={setCurrency} required /></div>
          <div data-variant="underlined"><CurrencySelector variant="underlined" testID="cp1-underlined" label="Currency" value={currency} onChange={setCurrency} required /></div>
          <div data-variant="inline"><CurrencySelector variant="inline" testID="cp1-inline" label="Currency" value={currency} onChange={setCurrency} required /></div>
          <div data-variant="pill"><CurrencySelector variant="pill" testID="cp1-pill" label="Currency" value={currency} onChange={setCurrency} required /></div>
        </> : null}
      </Section>
      <Section id="multi-select" title="Multi select">
        <MultiSelect testID="ms1" label="Accounts on the statement" options={accounts} value={picked} onChange={setPicked} helpText="Choose one or more" />
        {variantsShown ? <>
          <div data-variant="material"><MultiSelect variant="material" testID="ms1-material" label="Accounts on the statement" options={accounts} value={picked} onChange={setPicked} helpText="Choose one or more" /></div>
          <div data-variant="outlined"><MultiSelect variant="outlined" testID="ms1-outlined" label="Accounts on the statement" options={accounts} value={picked} onChange={setPicked} helpText="Choose one or more" /></div>
          <div data-variant="tonal"><MultiSelect variant="tonal" testID="ms1-tonal" label="Accounts on the statement" options={accounts} value={picked} onChange={setPicked} helpText="Choose one or more" /></div>
          <div data-variant="square"><MultiSelect variant="square" testID="ms1-square" label="Accounts on the statement" options={accounts} value={picked} onChange={setPicked} helpText="Choose one or more" /></div>
          <div data-variant="glass"><MultiSelect variant="glass" testID="ms1-glass" label="Accounts on the statement" options={accounts} value={picked} onChange={setPicked} helpText="Choose one or more" /></div>
        </> : null}
      </Section>
      <Section id="switch" title="Switch">
        <Toggle testID="sw1" label="Paperless statements" value={paperless} onChange={setPaperless} helpText="We email them on the 1st" />
        <Toggle testID="sw2" label="International use" value={false} disabled />
        {variantsShown ? <>
          <div data-variant="material"><Toggle variant="material" testID="sw1-material" label="Paperless statements" value={paperless} onChange={setPaperless} helpText="We email them on the 1st" /></div>
          <div data-variant="ios"><Toggle variant="ios" testID="sw1-ios" label="Paperless statements" value={paperless} onChange={setPaperless} helpText="We email them on the 1st" /></div>
          <div data-variant="fluent"><Toggle variant="fluent" testID="sw1-fluent" label="Paperless statements" value={paperless} onChange={setPaperless} helpText="We email them on the 1st" /></div>
          <div data-variant="labelled"><Toggle variant="labelled" testID="sw1-labelled" label="Paperless statements" value={paperless} onChange={setPaperless} helpText="We email them on the 1st" /></div>
          <div data-variant="squish"><Toggle variant="squish" testID="sw1-squish" label="Paperless statements" value={paperless} onChange={setPaperless} helpText="We email them on the 1st" /></div>
        </> : null}
      </Section>
      <Section id="date-range" title="Date range">
        <DateRangePicker testID="dr1" label="Statement period" value={period} onChange={setPeriod} maxDays={92} helpText="Up to 3 months" />
        {variantsShown ? <>
          <div data-variant="material"><DateRangePicker variant="material" testID="dr1-material" label="Statement period" value={period} onChange={setPeriod} maxDays={92} helpText="Up to 3 months" /></div>
          <div data-variant="outlined"><DateRangePicker variant="outlined" testID="dr1-outlined" label="Statement period" value={period} onChange={setPeriod} maxDays={92} helpText="Up to 3 months" /></div>
          <div data-variant="underlined"><DateRangePicker variant="underlined" testID="dr1-underlined" label="Statement period" value={period} onChange={setPeriod} maxDays={92} helpText="Up to 3 months" /></div>
          <div data-variant="inline"><DateRangePicker variant="inline" testID="dr1-inline" label="Statement period" value={period} onChange={setPeriod} maxDays={92} helpText="Up to 3 months" /></div>
        </> : null}
      </Section>
      <Section id="search" title="Search">
        <SearchField testID="se1" label="Search transactions" value={query} onChange={setQuery} placeholder="Payee, amount or reference" />
        {variantsShown ? <>
          <div data-variant="material"><SearchField variant="material" testID="se1-material" label="Search transactions" value={query} onChange={setQuery} placeholder="Payee, amount or reference" /></div>
          <div data-variant="outlined"><SearchField variant="outlined" testID="se1-outlined" label="Search transactions" value={query} onChange={setQuery} placeholder="Payee, amount or reference" /></div>
          <div data-variant="underlined"><SearchField variant="underlined" testID="se1-underlined" label="Search transactions" value={query} onChange={setQuery} placeholder="Payee, amount or reference" /></div>
          <div data-variant="floating"><SearchField variant="floating" testID="se1-floating" label="Search transactions" value={query} onChange={setQuery} placeholder="Payee, amount or reference" /></div>
          <div data-variant="inline"><SearchField variant="inline" testID="se1-inline" label="Search transactions" value={query} onChange={setQuery} placeholder="Payee, amount or reference" /></div>
          <div data-variant="pill"><SearchField variant="pill" testID="se1-pill" label="Search transactions" value={query} onChange={setQuery} placeholder="Payee, amount or reference" /></div>
        </> : null}
      </Section>
      <Section id="autocomplete" title="Autocomplete">
        <Autocomplete testID="ac1" label="Payee" value={payee} onChange={setPayee}
                      options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }]} />
        {variantsShown ? <>
          <div data-variant="material"><Autocomplete variant="material" testID="ac1-material" label="Payee" value={payee} onChange={setPayee}
                      options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }]} /></div>
          <div data-variant="outlined"><Autocomplete variant="outlined" testID="ac1-outlined" label="Payee" value={payee} onChange={setPayee}
                      options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }]} /></div>
          <div data-variant="underlined"><Autocomplete variant="underlined" testID="ac1-underlined" label="Payee" value={payee} onChange={setPayee}
                      options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }]} /></div>
          <div data-variant="inline"><Autocomplete variant="inline" testID="ac1-inline" label="Payee" value={payee} onChange={setPayee}
                      options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }]} /></div>
          <div data-variant="pill"><Autocomplete variant="pill" testID="ac1-pill" label="Payee" value={payee} onChange={setPayee}
                      options={[{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }]} /></div>
        </> : null}
      </Section>
      <Section id="document-upload" title="Document upload">
        <FileUpload testID="du1" label="Proof of address" value={proof} onChange={setProof} accept=".pdf,image/*" maxSize={5242880} helpText="A utility bill or a statement" />
        {variantsShown ? <>
          <div data-variant="material"><FileUpload variant="material" testID="du1-material" label="Proof of address" value={proof} onChange={setProof} accept=".pdf,image/*" maxSize={5242880} helpText="A utility bill or a statement" /></div>
          <div data-variant="dropzone"><FileUpload variant="dropzone" testID="du1-dropzone" label="Proof of address" value={proof} onChange={setProof} accept=".pdf,image/*" maxSize={5242880} helpText="A utility bill or a statement" /></div>
          <div data-variant="compact"><FileUpload variant="compact" testID="du1-compact" label="Proof of address" value={proof} onChange={setProof} accept=".pdf,image/*" maxSize={5242880} helpText="A utility bill or a statement" /></div>
          <div data-variant="card"><FileUpload variant="card" testID="du1-card" label="Proof of address" value={proof} onChange={setProof} accept=".pdf,image/*" maxSize={5242880} helpText="A utility bill or a statement" /></div>
        </> : null}
      </Section>
      <Section id="secondary-button" title="Secondary button">
        <SecondaryButton testID="sb1" label="Save for later" />
        <SecondaryButton testID="sb2" label="Save for later" disabled />
        {variantsShown ? <>
          <div data-variant="material"><SecondaryButton variant="material" testID="sb1-material" label="Save for later" /></div>
          <div data-variant="tonal"><SecondaryButton variant="tonal" testID="sb1-tonal" label="Save for later" /></div>
          <div data-variant="outlined"><SecondaryButton variant="outlined" testID="sb1-outlined" label="Save for later" /></div>
          <div data-variant="text"><SecondaryButton variant="text" testID="sb1-text" label="Save for later" /></div>
          <div data-variant="elevated"><SecondaryButton variant="elevated" testID="sb1-elevated" label="Save for later" /></div>
          <div data-variant="gradient"><SecondaryButton variant="gradient" testID="sb1-gradient" label="Save for later" /></div>
          <div data-variant="glass"><SecondaryButton variant="glass" testID="sb1-glass" label="Save for later" /></div>
          <div data-variant="pill"><SecondaryButton variant="pill" testID="sb1-pill" label="Save for later" /></div>
        </> : null}
      </Section>
      <Section id="danger-button" title="Danger button">
        <DestructiveButton testID="db1" label="Cancel payment" />
        <DestructiveButton testID="db2" label="Cancel payment" busy />
        {variantsShown ? <>
          <div data-variant="material"><DestructiveButton variant="material" testID="db1-material" label="Cancel payment" /></div>
          <div data-variant="tonal"><DestructiveButton variant="tonal" testID="db1-tonal" label="Cancel payment" /></div>
          <div data-variant="outlined"><DestructiveButton variant="outlined" testID="db1-outlined" label="Cancel payment" /></div>
          <div data-variant="text"><DestructiveButton variant="text" testID="db1-text" label="Cancel payment" /></div>
          <div data-variant="elevated"><DestructiveButton variant="elevated" testID="db1-elevated" label="Cancel payment" /></div>
          <div data-variant="gradient"><DestructiveButton variant="gradient" testID="db1-gradient" label="Cancel payment" /></div>
          <div data-variant="glass"><DestructiveButton variant="glass" testID="db1-glass" label="Cancel payment" /></div>
          <div data-variant="pill"><DestructiveButton variant="pill" testID="db1-pill" label="Cancel payment" /></div>
        </> : null}
      </Section>
      <Section id="savings-slider" title="Savings slider">
        <Slider testID="sl1" label="Monthly saving" value={saving} onChange={setSaving} prefix="USD" min={1500} max={20000} step={500} />
        {variantsShown ? <>
          <div data-variant="material"><Slider variant="material" testID="sl1-material" label="Monthly saving" value={saving} onChange={setSaving} prefix="USD" min={1500} max={20000} step={500} /></div>
          <div data-variant="ticks"><Slider variant="ticks" testID="sl1-ticks" label="Monthly saving" value={saving} onChange={setSaving} prefix="USD" min={1500} max={20000} step={500} /></div>
          <div data-variant="bubble"><Slider variant="bubble" testID="sl1-bubble" label="Monthly saving" value={saving} onChange={setSaving} prefix="USD" min={1500} max={20000} step={500} /></div>
          <div data-variant="thick"><Slider variant="thick" testID="sl1-thick" label="Monthly saving" value={saving} onChange={setSaving} prefix="USD" min={1500} max={20000} step={500} /></div>
        </> : null}
      </Section>
      <Section id="segmented" title="Segmented control">
        <ToggleGroup testID="sg1" label="Show" options={['Day', 'Week', 'Month']} value={show} onChange={setShow} />
        {variantsShown ? <>
          <div data-variant="material"><ToggleGroup variant="material" testID="sg1-material" label="Show" options={['Day', 'Week', 'Month']} value={show} onChange={setShow} /></div>
          <div data-variant="ios"><ToggleGroup variant="ios" testID="sg1-ios" label="Show" options={['Day', 'Week', 'Month']} value={show} onChange={setShow} /></div>
          <div data-variant="underline"><ToggleGroup variant="underline" testID="sg1-underline" label="Show" options={['Day', 'Week', 'Month']} value={show} onChange={setShow} /></div>
          <div data-variant="enclosed"><ToggleGroup variant="enclosed" testID="sg1-enclosed" label="Show" options={['Day', 'Week', 'Month']} value={show} onChange={setShow} /></div>
          <div data-variant="pill"><ToggleGroup variant="pill" testID="sg1-pill" label="Show" options={['Day', 'Week', 'Month']} value={show} onChange={setShow} /></div>
        </> : null}
      </Section>
      <Section id="filter-chips" title="Filter chips">
        <FilterChips testID="fc1" label="Filter" options={['Card', 'Transfer', 'Bills', 'Salary']} value={filters} onChange={setFilters} />
        {variantsShown ? <>
          <div data-variant="material"><FilterChips variant="material" testID="fc1-material" label="Filter" options={['Card', 'Transfer', 'Bills', 'Salary']} value={filters} onChange={setFilters} /></div>
          <div data-variant="outlined"><FilterChips variant="outlined" testID="fc1-outlined" label="Filter" options={['Card', 'Transfer', 'Bills', 'Salary']} value={filters} onChange={setFilters} /></div>
          <div data-variant="tonal"><FilterChips variant="tonal" testID="fc1-tonal" label="Filter" options={['Card', 'Transfer', 'Bills', 'Salary']} value={filters} onChange={setFilters} /></div>
          <div data-variant="square"><FilterChips variant="square" testID="fc1-square" label="Filter" options={['Card', 'Transfer', 'Bills', 'Salary']} value={filters} onChange={setFilters} /></div>
          <div data-variant="glass"><FilterChips variant="glass" testID="fc1-glass" label="Filter" options={['Card', 'Transfer', 'Bills', 'Salary']} value={filters} onChange={setFilters} /></div>
        </> : null}
      </Section>
      <Section id="action-menu" title="Action menu">
        <ActionMenu testID="am1" items={['Download statement', 'Set a nickname', { value: 'close', label: 'Close the account', danger: true }]} />
      </Section>
      <Section id="accordion" title="Accordion">
        <Accordion testID="ac1" items={faq} />
      </Section>
      <Section id="stepper" title="Stepper">
        <Stepper testID="st1" steps={['Details', 'Review', 'Done']} selectedStep="Review" />
      </Section>
      <Section id="breadcrumb" title="Breadcrumb">
        <Breadcrumb testID="bc1" items={['Accounts', 'Savings ·· 4821', 'Statement']} />
      </Section>
      <Section id="side-nav" title="Side navigation">
        <SideNav testID="sn1" items={['Accounts', 'Payments', { id: 'Cards', label: 'Cards', badge: 2 }]} selection={navSel} onSelectionChange={setNavSel} />
      </Section>
      <Section id="sheet" title="Sheet">
        <SecondaryButton label="Filter" onAction={() => setSheet(true)} />
        <Sheet testID="sh1" open={sheet} onOpenChange={setSheet} heading="Filter transactions"><p>Choose what to show.</p></Sheet>
      </Section>
      <Section id="grid" title="Grid">
        <Grid testID="gr1" columns={3}><Card heading="Savings" /><Card heading="Current" /><Card heading="Deposits" /></Grid>
      </Section>
      <Section id="divider" title="Divider">
        <Divider testID="dv1" />
        <Divider testID="dv2" label="Or" />
      </Section>
      <Section id="avatar" title="Avatar">
        <Avatar testID="av1" name="Asha Rao" />
        <Avatar testID="av2" name="J. Mehta" size="sm" />
        <Avatar testID="av3" name="S. Kapoor" size="lg" />
      </Section>
      <Section id="pagination" title="Pagination">
        <Pagination testID="pg1" page={page} pageCount={4} onPageChange={setPage} />
      </Section>
      <Section id="status-badge" title="Status badge">
        <StatusBadge testID="sb1" label="Completed" tone="success" />
        <StatusBadge label="Pending" tone="warning" />
        <StatusBadge label="Rejected" tone="danger" />
      </Section>
      <Section id="timeline" title="Timeline">
        <Timeline testID="tl1" items={[{ label: 'Initiated', meta: '09:12 · A. Rao' }, { label: 'Approved', meta: '10:40 · Priya Nair' }, { label: 'Sent to the bank', meta: '10:41', state: 'current' }, { label: 'Completed', state: 'pending' }]} />
      </Section>
      <Section id="spinner" title="Spinner">
        <Spinner testID="sp1" />
        <Spinner testID="sp2" size="lg" label="Loading accounts" />
      </Section>
      <Section id="skeleton" title="Skeleton">
        <Skeleton testID="sk1" />
        <Skeleton testID="sk2" shape="card" lines={2} />
        <Skeleton testID="sk3" shape="circle" lines={1} />
      </Section>
      <Section id="empty-state" title="Empty state">
        <EmptyState testID="es1" heading="No payees yet" text="Add one to pay faster next time." actionLabel="Add a payee" />
      </Section>
      <Section id="tooltip" title="Tooltip">
        <Tooltip testID="tt1" label="Available balance" text="What you can spend now: the balance less holds and pending card payments." />
      </Section>
      <Section id="alert-banner" title="Alert banner">
        <Alert testID="ab1" message="Transfers after 6 pm arrive the next working day." />
        <Alert testID="ab2" severity="warning" message="Your session ends in 2 minutes." dismissible />
      </Section>
      <Section id="error-message" title="Error message">
        <ErrorMessage testID="em1" message="The amount is more than your daily limit of 5,000.00." actionLabel="Change the amount" />
      </Section>
      <Section id="success-message" title="Success message">
        <SuccessMessage testID="sm1" message="Payment sent. Reference FX-20391." actionLabel="View receipt" />
      </Section>
      <Section id="notification-panel" title="Notification panel">
        <NotificationPanel testID="np1" items={notes} />
        <NotificationPanel testID="np2" heading="Alerts" items={[]} emptyText="No alerts." />
      </Section>
      <Section id="account-picker" title="Account picker">
        <AccountSelector testID="ap1" options={accounts} value={account} onChange={setAccount} />
        {variantsShown ? <>
          <div data-variant="material"><AccountSelector variant="material" testID="ap1-material" options={accounts} value={account} onChange={setAccount} /></div>
          <div data-variant="outlined"><AccountSelector variant="outlined" testID="ap1-outlined" options={accounts} value={account} onChange={setAccount} /></div>
          <div data-variant="underlined"><AccountSelector variant="underlined" testID="ap1-underlined" options={accounts} value={account} onChange={setAccount} /></div>
          <div data-variant="inline"><AccountSelector variant="inline" testID="ap1-inline" options={accounts} value={account} onChange={setAccount} /></div>
          <div data-variant="pill"><AccountSelector variant="pill" testID="ap1-pill" options={accounts} value={account} onChange={setAccount} /></div>
        </> : null}
      </Section>
      <Section id="account-summary" title="Account summary">
        <AccountSummary testID="as1" items={[{ label: 'Savings', value: '12,400.00', meta: 'Available 12,150.00' }, { label: 'Current', value: '3,210.50', meta: 'Overdraft 1,000.00' }, { label: 'Deposits', value: '25,000.00', meta: 'Matures 14 Mar' }]} onAction={() => undefined} />
      </Section>
      <Section id="balance-card" title="Balance card">
        <AccountBalance testID="bc1" label="Savings ·· 4821" amount={12400} currency="USD" meta="Available 12,150.00" />
        <AccountBalance testID="bc2" label="Current ·· 7730" amount={3210.5} currency="USD" amountHidden />
      </Section>
      <Section id="account-card" title="Account card">
        <AccountCard testID="ac1" heading="Savings ·· 4821" text="Balance 12,400.00 · Available 12,150.00" badge="Primary" actionLabel="View details →" />
      </Section>
      <Section id="account-details" title="Account details">
        <AccountDetails items={[{ label: 'Account', value: 'Savings ·· 4821' }, { label: 'Branch', value: 'London Bridge' }, { label: 'IBAN', value: 'GB29 •••• 9268 19' }, { label: 'Holder', value: 'A. Rao' }]} actionLabel="Download statement" />
      </Section>
      <Section id="iban" title="IBAN">
        <AccountNumber testID="ib1" value={iban} onChange={setIban} required />
        <AccountNumber testID="ib2" value="GB28NWBK60161331926819" error="Check the IBAN: it starts with the country code." />
        {variantsShown ? <>
          <div data-variant="material"><AccountNumber variant="material" testID="ib1-material" value={iban} onChange={setIban} required /></div>
          <div data-variant="outlined"><AccountNumber variant="outlined" testID="ib1-outlined" value={iban} onChange={setIban} required /></div>
          <div data-variant="underlined"><AccountNumber variant="underlined" testID="ib1-underlined" value={iban} onChange={setIban} required /></div>
          <div data-variant="floating"><AccountNumber variant="floating" testID="ib1-floating" value={iban} onChange={setIban} required /></div>
          <div data-variant="inline"><AccountNumber variant="inline" testID="ib1-inline" value={iban} onChange={setIban} required /></div>
          <div data-variant="pill"><AccountNumber variant="pill" testID="ib1-pill" value={iban} onChange={setIban} required /></div>
        </> : null}
      </Section>
      <Section id="quick-actions" title="Quick actions">
        <QuickActions testID="qa1" items={[{ id: 'send', label: 'Send', icon: '↗' }, { id: 'bills', label: 'Pay bills', icon: '≡' }, { id: 'topup', label: 'Top up', icon: '+' }, { id: 'scan', label: 'Scan to pay', icon: '⌗' }]} />
      </Section>
      <Section id="payee-list" title="Payee list">
        <BeneficiarySelector testID="pl1" items={payees} />
      </Section>
      <Section id="beneficiary-card" title="Beneficiary card">
        <BeneficiaryCard testID="bf1" heading="A. Rao" text="GB29 •••• 9268 19 · added 12 Mar" badge="HSBC" actionLabel="Pay now →" />
      </Section>
      <Section id="payment-form" title="Payment form">
        <PaymentForm testID="pf1" cancelLabel="Cancel"><AccountSelector testID="pf1-from" options={accounts} value={account} onChange={setAccount} /><AmountInput testID="pf1-amt" label="Amount" currency="USD" value={null} /></PaymentForm>
      </Section>
      <Section id="transfer-summary" title="Transfer summary">
        <TransferSummary items={[{ label: 'From', value: 'Savings ·· 4821' }, { label: 'To', value: 'A. Rao · HSBC' }, { label: 'Amount', value: '1,250.00 USD' }, { label: 'Fee', value: '0.00' }, { label: 'Arrives', value: 'Today' }]} />
      </Section>
      <Section id="payment-status" title="Payment status">
        <PaymentStatus testID="ps1" steps={['Initiated', 'Approved', 'Sent', 'Completed']} selectedStep="Sent" />
      </Section>
      <Section id="transaction-list" title="Transaction list">
        <TransactionHistory testID="tx1" currency="USD" items={txns} onAction={() => undefined} />
        <TransactionHistory testID="tx2" heading="Last month" items={[]} />
      </Section>
      <Section id="transaction-filter" title="Transaction filter">
        <TransactionFilter testID="tf1" options={['Money in', 'Money out', 'Cards', 'Transfers']} value={txFilter} onChange={setTxFilter} />
        {variantsShown ? <>
          <div data-variant="material"><TransactionFilter variant="material" testID="tf1-material" options={['Money in', 'Money out', 'Cards', 'Transfers']} value={txFilter} onChange={setTxFilter} /></div>
          <div data-variant="outlined"><TransactionFilter variant="outlined" testID="tf1-outlined" options={['Money in', 'Money out', 'Cards', 'Transfers']} value={txFilter} onChange={setTxFilter} /></div>
          <div data-variant="tonal"><TransactionFilter variant="tonal" testID="tf1-tonal" options={['Money in', 'Money out', 'Cards', 'Transfers']} value={txFilter} onChange={setTxFilter} /></div>
          <div data-variant="square"><TransactionFilter variant="square" testID="tf1-square" options={['Money in', 'Money out', 'Cards', 'Transfers']} value={txFilter} onChange={setTxFilter} /></div>
          <div data-variant="glass"><TransactionFilter variant="glass" testID="tf1-glass" options={['Money in', 'Money out', 'Cards', 'Transfers']} value={txFilter} onChange={setTxFilter} /></div>
        </> : null}
      </Section>
      <Section id="transaction-details" title="Transaction details">
        <TransactionDetails items={[{ label: 'Description', value: 'Coffee House' }, { label: 'Date', value: 'Today 08:14' }, { label: 'Amount', value: '-4.50 USD' }, { label: 'Card', value: '·· 4821' }, { label: 'Reference', value: 'TX-88211' }]} actionLabel="Dispute it" />
      </Section>
      <Section id="repeat" title="Repeat">
        <PaymentSchedule testID="rp1" value={repeat} onChange={setRepeat} />
        {variantsShown ? <>
          <div data-variant="material"><PaymentSchedule variant="material" testID="rp1-material" value={repeat} onChange={setRepeat} /></div>
          <div data-variant="ios"><PaymentSchedule variant="ios" testID="rp1-ios" value={repeat} onChange={setRepeat} /></div>
          <div data-variant="underline"><PaymentSchedule variant="underline" testID="rp1-underline" value={repeat} onChange={setRepeat} /></div>
          <div data-variant="enclosed"><PaymentSchedule variant="enclosed" testID="rp1-enclosed" value={repeat} onChange={setRepeat} /></div>
          <div data-variant="pill"><PaymentSchedule variant="pill" testID="rp1-pill" value={repeat} onChange={setRepeat} /></div>
        </> : null}
      </Section>
      <Section id="receipt" title="Receipt">
        <TransactionReceipt testID="rc1" amount={1250} currency="USD" reference="FX-20391" items={[{ label: 'From', value: 'Savings ·· 4821' }, { label: 'To', value: 'A. Rao · HSBC' }]}><SecondaryButton label="Download" /></TransactionReceipt>
      </Section>
      <Section id="upcoming-bills" title="Upcoming bills">
        <UpcomingBills testID="ub1" items={bills} />
      </Section>
      <Section id="td-summary" title="Deposits summary">
        <DepositsSummary testID="ts1" items={[{ label: 'Deposits', value: '4', meta: 'Total 62,500.00' }, { label: 'Interest earned', value: '1,840.20', meta: 'This year' }, { label: 'Next maturity', value: '14 Mar', meta: '·· 9011 · 25,000.00' }]} />
      </Section>
      <Section id="new-td" title="New deposit">
        <NewDepositForm testID="nt1" items={[{ label: 'From account', value: 'Savings ·· 4821' }, { label: 'Amount (USD)', value: '10,000.00' }, { label: 'Tenure', value: '12 months' }]} />
      </Section>
      <Section id="maturity-instructions" title="Maturity instructions">
        <MaturityInstructions testID="mi1" options={['Renew principal and interest', 'Renew principal, pay out interest', 'Close and pay out']} value={maturity} onChange={setMaturity} />
        {variantsShown ? <>
          <div data-variant="material"><MaturityInstructions variant="material" testID="mi1-material" options={['Renew principal and interest', 'Renew principal, pay out interest', 'Close and pay out']} value={maturity} onChange={setMaturity} /></div>
          <div data-variant="cards"><MaturityInstructions variant="cards" testID="mi1-cards" options={['Renew principal and interest', 'Renew principal, pay out interest', 'Close and pay out']} value={maturity} onChange={setMaturity} /></div>
          <div data-variant="chips"><MaturityInstructions variant="chips" testID="mi1-chips" options={['Renew principal and interest', 'Renew principal, pay out interest', 'Close and pay out']} value={maturity} onChange={setMaturity} /></div>
          <div data-variant="rows"><MaturityInstructions variant="rows" testID="mi1-rows" options={['Renew principal and interest', 'Renew principal, pay out interest', 'Close and pay out']} value={maturity} onChange={setMaturity} /></div>
        </> : null}
      </Section>
      <Section id="td-topup" title="Deposit top-up">
        <DepositTopUp items={[{ label: 'Deposit', value: '·· 9011' }, { label: 'Current amount', value: '25,000.00' }, { label: 'Top-up', value: '5,000.00' }, { label: 'New maturity value', value: '31,950.00', total: true }]} />
      </Section>
      <Section id="td-redemption" title="Deposit redemption">
        <DepositRedemption items={[{ label: 'Deposit', value: '·· 9011' }, { label: 'Principal', value: '25,000.00' }, { label: 'Interest to date', value: '612.40' }, { label: 'Early penalty', value: '-62.50' }, { label: 'You receive', value: '25,549.90', total: true }]} />
      </Section>
      <Section id="loan-summary" title="Loans summary">
        <LoansSummary items={[{label: 'Home loan', value: '142,300.00', meta: 'Next 1,240.00 on 5 Feb'}, {label: 'Car loan', value: '18,420.00', meta: 'Next 412.00 on 5 Feb'}, {label: 'Overdue', value: '412.00', meta: 'Car loan · 12 days'}]} />
      </Section>
      <Section id="loan-repayment" title="Loan repayment">
        <LoanRepayment items={[{label: 'Loan', value: 'Car loan ·· 3310'}, {label: 'Amount (USD)', value: '412.00'}, {label: 'Pay from', value: 'Savings ·· 4821'}]} />
      </Section>
      <Section id="loan-schedule" title="Repayment schedule">
        <RepaymentSchedule testID="ls1" rows={[{date: '05 Feb', amount: '412.00', status: 'due'}, {date: '05 Mar', amount: '412.00'}, {date: '05 Apr', amount: '412.00'}]} />
      </Section>
      <Section id="promise-to-pay" title="Promise to pay">
        <PromiseToPay items={[{label: 'Overdue', value: '412.00'}, {label: 'Promise date', value: '20 Jan'}, {label: 'Pay from', value: 'Savings ·· 4821'}]} />
      </Section>
      <Section id="disbursement" title="Disbursement timeline">
        <DisbursementTimeline items={[{label: 'Sanctioned 30,000.00', meta: '02 Jan'}, {label: 'First disbursement 20,000.00', meta: '05 Jan'}, {label: 'Second disbursement 10,000.00', meta: 'Due 05 Mar', state: 'pending'}]} />
      </Section>
      <Section id="card-tile" title="Card tile">
        <CardTile testID="ct1" label="Platinum" number="4111111111114821" holder="A. RAO" expiry="09/29" network="Visa" />
        <CardTile testID="ct2" label="Classic" number="4111111111117710" network="Visa" frozen />
      </Section>
      <Section id="card-list" title="Card list">
        <CardList items={[{label: 'Platinum ·· 4821', value: '640.00 due', meta: 'Limit 10,000.00 · due 18 Jan'}, {label: 'Classic ·· 7710', value: '0.00 due', meta: 'Limit 3,000.00'}]} />
      </Section>
      <Section id="activate-card" title="Activate card">
        <ActivateCard testID="ak1" value={code} onChange={setCode} />
        {variantsShown ? <>
          <div data-variant="material"><ActivateCard variant="material" testID="ak1-material" value={code} onChange={setCode} /></div>
          <div data-variant="underline"><ActivateCard variant="underline" testID="ak1-underline" value={code} onChange={setCode} /></div>
          <div data-variant="rounded"><ActivateCard variant="rounded" testID="ak1-rounded" value={code} onChange={setCode} /></div>
          <div data-variant="joined"><ActivateCard variant="joined" testID="ak1-joined" value={code} onChange={setCode} /></div>
        </> : null}
      </Section>
      <Section id="convert-emi" title="Convert to EMI">
        <ConvertToEmi testID="ce1" label="Pay 1,200.00 over" value={emi} onChange={setEmi} />
        {variantsShown ? <>
          <div data-variant="material"><ConvertToEmi variant="material" testID="ce1-material" label="Pay 1,200.00 over" value={emi} onChange={setEmi} /></div>
          <div data-variant="ios"><ConvertToEmi variant="ios" testID="ce1-ios" label="Pay 1,200.00 over" value={emi} onChange={setEmi} /></div>
          <div data-variant="underline"><ConvertToEmi variant="underline" testID="ce1-underline" label="Pay 1,200.00 over" value={emi} onChange={setEmi} /></div>
          <div data-variant="enclosed"><ConvertToEmi variant="enclosed" testID="ce1-enclosed" label="Pay 1,200.00 over" value={emi} onChange={setEmi} /></div>
          <div data-variant="pill"><ConvertToEmi variant="pill" testID="ce1-pill" label="Pay 1,200.00 over" value={emi} onChange={setEmi} /></div>
        </> : null}
      </Section>
      <Section id="redeem-points" title="Redeem points">
        <RedeemPoints testID="rd1" value={points} onChange={setPoints} />
        {variantsShown ? <>
          <div data-variant="material"><RedeemPoints variant="material" testID="rd1-material" value={points} onChange={setPoints} /></div>
          <div data-variant="ticks"><RedeemPoints variant="ticks" testID="rd1-ticks" value={points} onChange={setPoints} /></div>
          <div data-variant="bubble"><RedeemPoints variant="bubble" testID="rd1-bubble" value={points} onChange={setPoints} /></div>
          <div data-variant="thick"><RedeemPoints variant="thick" testID="rd1-thick" value={points} onChange={setPoints} /></div>
        </> : null}
      </Section>
      <Section id="spend-limit" title="Card limits">
        <CardLimits testID="sl1" value={limit} onChange={setLimit} prefix="USD" />
      </Section>
      <Section id="card-controls" title="Card controls">
        <CardControls testID="cc1" options={['Online payments', 'ATM withdrawals', 'Use abroad']} value={controls} onChange={setControls} />
        {variantsShown ? <>
          <div data-variant="material"><CardControls variant="material" testID="cc1-material" options={['Online payments', 'ATM withdrawals', 'Use abroad']} value={controls} onChange={setControls} /></div>
          <div data-variant="cards"><CardControls variant="cards" testID="cc1-cards" options={['Online payments', 'ATM withdrawals', 'Use abroad']} value={controls} onChange={setControls} /></div>
          <div data-variant="chips"><CardControls variant="chips" testID="cc1-chips" options={['Online payments', 'ATM withdrawals', 'Use abroad']} value={controls} onChange={setControls} /></div>
          <div data-variant="rows"><CardControls variant="rows" testID="cc1-rows" options={['Online payments', 'ATM withdrawals', 'Use abroad']} value={controls} onChange={setControls} /></div>
          <div data-variant="round"><CardControls variant="round" testID="cc1-round" options={['Online payments', 'ATM withdrawals', 'Use abroad']} value={controls} onChange={setControls} /></div>
        </> : null}
      </Section>
      <Section id="block-card" title="Block card">
        <BlockCard testID="bk1" value={blocked} onChange={setBlocked} />
        {variantsShown ? <>
          <div data-variant="material"><BlockCard variant="material" testID="bk1-material" value={blocked} onChange={setBlocked} /></div>
          <div data-variant="ios"><BlockCard variant="ios" testID="bk1-ios" value={blocked} onChange={setBlocked} /></div>
          <div data-variant="fluent"><BlockCard variant="fluent" testID="bk1-fluent" value={blocked} onChange={setBlocked} /></div>
          <div data-variant="labelled"><BlockCard variant="labelled" testID="bk1-labelled" value={blocked} onChange={setBlocked} /></div>
          <div data-variant="squish"><BlockCard variant="squish" testID="bk1-squish" value={blocked} onChange={setBlocked} /></div>
        </> : null}
      </Section>
      <Section id="reset-pin" title="Reset PIN">
        <ResetPin testID="rp1" value={pin} onChange={setPin} />
        {variantsShown ? <>
          <div data-variant="material"><ResetPin variant="material" testID="rp1-material" value={pin} onChange={setPin} /></div>
          <div data-variant="underline"><ResetPin variant="underline" testID="rp1-underline" value={pin} onChange={setPin} /></div>
          <div data-variant="rounded"><ResetPin variant="rounded" testID="rp1-rounded" value={pin} onChange={setPin} /></div>
          <div data-variant="joined"><ResetPin variant="joined" testID="rp1-joined" value={pin} onChange={setPin} /></div>
        </> : null}
      </Section>
      <Section id="raise-dispute" title="Raise dispute">
        <RaiseDispute items={[{label: 'Transaction', value: 'Coffee House · 4.50'}, {label: 'Reason', value: 'Charged twice'}]} />
      </Section>
      <Section id="add-on-card" title="Add-on card">
        <AddOnCard items={[{label: 'Name on the card', value: 'S. Rao'}, {label: 'Relationship', value: 'Spouse'}, {label: 'Limit (USD)', value: '2,000.00'}]} />
      </Section>
      <Section id="card-statements" title="Card statements">
        <CardStatements items={[{title: 'December statement', meta: 'Generated 01 Jan', value: 'PDF'}, {title: 'November statement', meta: 'Generated 01 Dec', value: 'PDF'}]} />
      </Section>
      <Section id="otp" title="One-time code">
        <OtpInput testID="ot1" value={code} onChange={setCode} helpText="We sent it to •••• 0123" />
        <OtpInput testID="ot2" value="123456" error="That code is not right. Check it, or send a new one." />
        {variantsShown ? <>
          <div data-variant="material"><OtpInput variant="material" testID="ot1-material" value={code} onChange={setCode} helpText="We sent it to •••• 0123" /></div>
          <div data-variant="underline"><OtpInput variant="underline" testID="ot1-underline" value={code} onChange={setCode} helpText="We sent it to •••• 0123" /></div>
          <div data-variant="rounded"><OtpInput variant="rounded" testID="ot1-rounded" value={code} onChange={setCode} helpText="We sent it to •••• 0123" /></div>
          <div data-variant="joined"><OtpInput variant="joined" testID="ot1-joined" value={code} onChange={setCode} helpText="We sent it to •••• 0123" /></div>
        </> : null}
      </Section>
      <Section id="biometric" title="Biometric">
        <AuthChallenge testID="bm1" text="Touch the sensor to approve 1,250.00 to A. Rao." />
        <AuthChallenge testID="bm2" method="face" actionLabel="Use Face ID" state="failed" />
      </Section>
      <Section id="session-timeout" title="Session timeout">
        <SecondaryButton label="Show the warning" onAction={() => setTimeoutOpen(true)} />
        <SessionExpiryWarning testID="st1" open={timeout} seconds={90} onStay={() => setTimeoutOpen(false)} onSignOut={() => setTimeoutOpen(false)} onExpire={() => setTimeoutOpen(false)} />
      </Section>
      <Section id="secure-confirmation" title="Secure confirmation">
        <SecureConfirmation items={[{label: 'Pay', value: 'A. Rao'}, {label: 'Amount', value: '1,250.00 USD'}, {label: 'Code sent to', value: '•••• 0123'}]} />
      </Section>
      <Section id="sensitive" title="Sensitive field">
        <SensitiveField testID="sf1" value="4111 1111 1111 4821" />
        {variantsShown ? <>
          <div data-variant="material"><SensitiveField variant="material" testID="sf1-material" value="4111 1111 1111 4821" /></div>
          <div data-variant="outlined"><SensitiveField variant="outlined" testID="sf1-outlined" value="4111 1111 1111 4821" /></div>
          <div data-variant="underlined"><SensitiveField variant="underlined" testID="sf1-underlined" value="4111 1111 1111 4821" /></div>
          <div data-variant="floating"><SensitiveField variant="floating" testID="sf1-floating" value="4111 1111 1111 4821" /></div>
          <div data-variant="inline"><SensitiveField variant="inline" testID="sf1-inline" value="4111 1111 1111 4821" /></div>
        </> : null}
      </Section>
      <Section id="kyc-steps" title="KYC steps">
        <KycSteps testID="ky1" selectedStep="Selfie" />
      </Section>
      <Section id="fraud-alert" title="Fraud alert">
        <FraudAlert testID="fa1" message="We stopped a payment of 899.00 to Unknown Ltd." />
      </Section>
      <Section id="spending-chart" title="Spending chart">
        <SpendingChart items={[{label: 'Aug', value: 1240}, {label: 'Sep', value: 980}, {label: 'Oct', value: 1410}, {label: 'Nov', value: 1640}, {label: 'Dec', value: 2120}]} unit="USD" />
      </Section>
      <Section id="budget-progress" title="Budget progress">
        <ProgressBar items={[{label: 'Groceries', value: 320, max: 400}, {label: 'Travel', value: 180, max: 300}, {label: 'Eating out', value: 210, max: 200}]} />
      </Section>
      <Section id="savings-goal" title="Savings goal">
        <SavingsGoal items={[{label: 'Holiday fund', value: 1800, max: 3000}]} unit="USD" />
      </Section>
      <Section id="spend-categories" title="Spend categories">
        <SpendCategories options={['Eating out', 'Groceries', 'Travel', 'Shopping']} label="Coffee House · 4.50 is" value={cats} onChange={setCats} />
        {variantsShown ? <>
          <div data-variant="material"><SpendCategories variant="material" options={['Eating out', 'Groceries', 'Travel', 'Shopping']} label="Coffee House · 4.50 is" value={cats} onChange={setCats} /></div>
          <div data-variant="outlined"><SpendCategories variant="outlined" options={['Eating out', 'Groceries', 'Travel', 'Shopping']} label="Coffee House · 4.50 is" value={cats} onChange={setCats} /></div>
          <div data-variant="tonal"><SpendCategories variant="tonal" options={['Eating out', 'Groceries', 'Travel', 'Shopping']} label="Coffee House · 4.50 is" value={cats} onChange={setCats} /></div>
          <div data-variant="square"><SpendCategories variant="square" options={['Eating out', 'Groceries', 'Travel', 'Shopping']} label="Coffee House · 4.50 is" value={cats} onChange={setCats} /></div>
          <div data-variant="glass"><SpendCategories variant="glass" options={['Eating out', 'Groceries', 'Travel', 'Shopping']} label="Coffee House · 4.50 is" value={cats} onChange={setCats} /></div>
        </> : null}
      </Section>
      <Section id="approval-queue" title="Approval queue">
        <ApprovalQueue items={[{title: 'Payroll Feb · prioritized', meta: 'Financial · 182,400.00', value: 'PAY-4410'}, {title: 'Vendor ABC Ltd', meta: 'Financial · 12,000.00', value: 'PAY-4412'}, {title: 'Add payee J. Mehta', meta: 'Non-financial', value: 'BEN-218'}]} />
      </Section>
      <Section id="approval-detail" title="Approval detail">
        <ApprovalDetail items={[{label: 'Reference', value: 'PAY-4410'}, {label: 'Initiated by', value: 'A. Rao, maker'}, {label: 'Amount', value: '182,400.00 USD'}, {label: 'Value date', value: '28 Jan'}, {label: 'Your level', value: '2 of 3'}]} />
      </Section>
      <Section id="approval-journey" title="Approval journey">
        <ApprovalJourney items={[{label: 'Initiated', meta: 'A. Rao · 09:12'}, {label: 'Approved, level 1', meta: 'P. Nair · 10:40'}, {label: 'Waiting, level 2', meta: 'Finance head', state: 'current'}, {label: 'Release', meta: 'Treasury', state: 'pending'}]} />
      </Section>
      <Section id="reroute" title="Re-route">
        <Reroute testID="rr1" options={approvers} value={reroute} onChange={setReroute} />
        {variantsShown ? <>
          <div data-variant="material"><Reroute variant="material" testID="rr1-material" options={approvers} value={reroute} onChange={setReroute} /></div>
          <div data-variant="outlined"><Reroute variant="outlined" testID="rr1-outlined" options={approvers} value={reroute} onChange={setReroute} /></div>
          <div data-variant="underlined"><Reroute variant="underlined" testID="rr1-underlined" options={approvers} value={reroute} onChange={setReroute} /></div>
          <div data-variant="inline"><Reroute variant="inline" testID="rr1-inline" options={approvers} value={reroute} onChange={setReroute} /></div>
          <div data-variant="pill"><Reroute variant="pill" testID="rr1-pill" options={approvers} value={reroute} onChange={setReroute} /></div>
        </> : null}
      </Section>
      <Section id="modification-requested" title="Modification requested">
        <ModificationNotice message="PAY-4410 was sent back: change the value date to a working day." />
      </Section>
      <Section id="pending-release" title="Pending release">
        <PendingRelease items={[{title: 'Payroll Jan', meta: 'Approved 3 of 3', value: '182,400.00'}, {title: 'Tax payment', meta: 'Approved 2 of 2', value: '9,800.00'}]} />
      </Section>
      <Section id="structure-type" title="Structure type">
        <StructureType value={structure} onChange={setStructure} />
        {variantsShown ? <>
          <div data-variant="material"><StructureType variant="material" value={structure} onChange={setStructure} /></div>
          <div data-variant="ios"><StructureType variant="ios" value={structure} onChange={setStructure} /></div>
          <div data-variant="underline"><StructureType variant="underline" value={structure} onChange={setStructure} /></div>
          <div data-variant="enclosed"><StructureType variant="enclosed" value={structure} onChange={setStructure} /></div>
          <div data-variant="pill"><StructureType variant="pill" value={structure} onChange={setStructure} /></div>
        </> : null}
      </Section>
      <Section id="account-structure" title="Account structure">
        <AccountStructure items={[{id: 'h', title: 'Header account ·· 1000', body: 'Sweeps to zero balance daily at 18:00.'}, {id: 'p', title: 'Child: Payroll ·· 1010', body: 'Target balance 5,000.00.'}, {id: 'v', title: 'Child: Vendors ·· 1020', body: 'Sweeps above 2,000.00.'}]} />
      </Section>
      <Section id="structure-simulation" title="Structure simulation">
        <StructureSimulation items={[{label: 'Structure', value: 'Daily zero balance'}, {label: 'Accounts', value: '3'}, {label: 'Moved today', value: '182,400.00'}, {label: 'Interest benefit', value: '1,210.00 a month'}]} />
      </Section>
      <Section id="intercompany-limits" title="Intercompany limits">
        <LendLimits items={[{label: 'Payroll Ltd', value: 120, max: 500}, {label: 'Vendors Ltd', value: 340, max: 400}]} unit="k" />
      </Section>
      <Section id="sweep-monitor" title="Sweep monitor">
        <SweepMonitor items={[{label: 'Sweep started', meta: '18:00'}, {label: '3 of 3 accounts swept', meta: '18:02'}, {label: 'Interest reallocated', meta: '18:05', state: 'current'}]} />
      </Section>
      <Section id="profile" title="Profile">
        <Profile items={[{label: 'Name', value: 'A. Rao'}, {label: 'Email', value: 'a.rao@mail.example'}, {label: 'Mobile', value: '•••• 0123'}, {label: 'Address', value: '12 Bridge St, London'}]} />
      </Section>
      <Section id="sign-in-options" title="Sign-in options">
        <SignInOptions options={['Passkey', 'Facial ID', 'Soft token']} value={signIn} onChange={setSignIn} />
        {variantsShown ? <>
          <div data-variant="material"><SignInOptions variant="material" options={['Passkey', 'Facial ID', 'Soft token']} value={signIn} onChange={setSignIn} /></div>
          <div data-variant="cards"><SignInOptions variant="cards" options={['Passkey', 'Facial ID', 'Soft token']} value={signIn} onChange={setSignIn} /></div>
          <div data-variant="chips"><SignInOptions variant="chips" options={['Passkey', 'Facial ID', 'Soft token']} value={signIn} onChange={setSignIn} /></div>
          <div data-variant="rows"><SignInOptions variant="rows" options={['Passkey', 'Facial ID', 'Soft token']} value={signIn} onChange={setSignIn} /></div>
          <div data-variant="round"><SignInOptions variant="round" options={['Passkey', 'Facial ID', 'Soft token']} value={signIn} onChange={setSignIn} /></div>
        </> : null}
      </Section>
      <Section id="otp-delivery" title="Code delivery">
        <CodeDelivery value={codesBy} onChange={setCodesBy} />
        {variantsShown ? <>
          <div data-variant="material"><CodeDelivery variant="material" value={codesBy} onChange={setCodesBy} /></div>
          <div data-variant="ios"><CodeDelivery variant="ios" value={codesBy} onChange={setCodesBy} /></div>
          <div data-variant="underline"><CodeDelivery variant="underline" value={codesBy} onChange={setCodesBy} /></div>
          <div data-variant="enclosed"><CodeDelivery variant="enclosed" value={codesBy} onChange={setCodesBy} /></div>
          <div data-variant="pill"><CodeDelivery variant="pill" value={codesBy} onChange={setCodesBy} /></div>
        </> : null}
      </Section>
      <Section id="devices" title="Devices">
        <Devices items={[{title: 'iPhone 15 · this device', meta: 'Registered 12 Mar', value: 'Active'}, {title: 'Chrome on Windows', meta: 'Last used today', value: 'Web'}]} />
      </Section>
      <Section id="appearance" title="Appearance">
        <Appearance value={theme} onChange={setTheme} />
        {variantsShown ? <>
          <div data-variant="material"><Appearance variant="material" value={theme} onChange={setTheme} /></div>
          <div data-variant="ios"><Appearance variant="ios" value={theme} onChange={setTheme} /></div>
          <div data-variant="underline"><Appearance variant="underline" value={theme} onChange={setTheme} /></div>
          <div data-variant="enclosed"><Appearance variant="enclosed" value={theme} onChange={setTheme} /></div>
          <div data-variant="pill"><Appearance variant="pill" value={theme} onChange={setTheme} /></div>
        </> : null}
      </Section>
      <Section id="language" title="Language">
        <LanguagePicker testID="lg1" options={languages} value={lang} onChange={setLang} />
        {variantsShown ? <>
          <div data-variant="material"><LanguagePicker variant="material" testID="lg1-material" options={languages} value={lang} onChange={setLang} /></div>
          <div data-variant="outlined"><LanguagePicker variant="outlined" testID="lg1-outlined" options={languages} value={lang} onChange={setLang} /></div>
          <div data-variant="underlined"><LanguagePicker variant="underlined" testID="lg1-underlined" options={languages} value={lang} onChange={setLang} /></div>
          <div data-variant="inline"><LanguagePicker variant="inline" testID="lg1-inline" options={languages} value={lang} onChange={setLang} /></div>
          <div data-variant="pill"><LanguagePicker variant="pill" testID="lg1-pill" options={languages} value={lang} onChange={setLang} /></div>
        </> : null}
      </Section>
      <Section id="alerts-subscription" title="Alert subscriptions">
        <AlertSubscriptions options={['Payments over 500.00', 'Low balance', 'Sign-in from a new device']} value={alerts} onChange={setAlerts} />
        {variantsShown ? <>
          <div data-variant="material"><AlertSubscriptions variant="material" options={['Payments over 500.00', 'Low balance', 'Sign-in from a new device']} value={alerts} onChange={setAlerts} /></div>
          <div data-variant="cards"><AlertSubscriptions variant="cards" options={['Payments over 500.00', 'Low balance', 'Sign-in from a new device']} value={alerts} onChange={setAlerts} /></div>
          <div data-variant="chips"><AlertSubscriptions variant="chips" options={['Payments over 500.00', 'Low balance', 'Sign-in from a new device']} value={alerts} onChange={setAlerts} /></div>
          <div data-variant="rows"><AlertSubscriptions variant="rows" options={['Payments over 500.00', 'Low balance', 'Sign-in from a new device']} value={alerts} onChange={setAlerts} /></div>
          <div data-variant="round"><AlertSubscriptions variant="round" options={['Payments over 500.00', 'Low balance', 'Sign-in from a new device']} value={alerts} onChange={setAlerts} /></div>
        </> : null}
      </Section>
      <Section id="do-not-disturb" title="Do not disturb">
        <DoNotDisturb value={quiet} onChange={setQuiet} />
        {variantsShown ? <>
          <div data-variant="material"><DoNotDisturb variant="material" value={quiet} onChange={setQuiet} /></div>
          <div data-variant="ios"><DoNotDisturb variant="ios" value={quiet} onChange={setQuiet} /></div>
          <div data-variant="fluent"><DoNotDisturb variant="fluent" value={quiet} onChange={setQuiet} /></div>
          <div data-variant="labelled"><DoNotDisturb variant="labelled" value={quiet} onChange={setQuiet} /></div>
          <div data-variant="squish"><DoNotDisturb variant="squish" value={quiet} onChange={setQuiet} /></div>
        </> : null}
      </Section>
      <Section id="consents" title="Consents">
        <Consents items={[{title: 'Budget app (open banking)', meta: 'Granted 02 Jan · ends 02 Apr', value: 'Accounts'}, {title: 'Tax filing service', meta: 'Granted 10 Dec · ends 10 Mar', value: 'Statements'}]} />
      </Section>
      <Section id="transaction-limits" title="Transaction limits">
        <TransactionLimits items={[{label: 'Daily transfers', value: 1200, max: 5000}, {label: 'Bill payments', value: 300, max: 2000}]} />
      </Section>
      <Section id="session-summary" title="Session summary">
        <SessionSummary items={[{label: 'Today 08:12', meta: 'iPhone 15 · London'}, {label: 'Yesterday 19:40', meta: 'Chrome on Windows · London'}, {label: '3 Jan 07:55', meta: 'iPhone 15 · Paris'}]} />
      </Section>
      <Section id="raise-request" title="Raise request">
        <RaiseRequest items={[{label: 'Request', value: 'Cheque book'}, {label: 'Account', value: 'Savings ·· 4821'}, {label: 'Leaves', value: '25'}]} />
      </Section>
      <Section id="track-requests" title="Track requests">
        <TrackRequests items={[{label: 'Received', meta: 'SR-2210 · 10 Jan'}, {label: 'In progress', meta: 'Printing the cheque book', state: 'current'}, {label: 'Dispatched', meta: 'Expected 15 Jan', state: 'pending'}]} />
      </Section>
      <Section id="mailbox" title="Mailbox">
        <Mailbox items={[{title: 'Your cheque book is on the way', meta: 'Today', value: 'Mail', unread: true}, {title: 'Low balance on Current ·· 7730', meta: 'Yesterday', value: 'Alert'}, {title: 'New statement ready', meta: '2 days ago', value: 'Notice'}]} />
      </Section>
      <Section id="compose-mail" title="Compose message">
        <ComposeMessage value={message} onChange={setMessage} />
        {variantsShown ? <>
          <div data-variant="material"><ComposeMessage variant="material" value={message} onChange={setMessage} /></div>
          <div data-variant="outlined"><ComposeMessage variant="outlined" value={message} onChange={setMessage} /></div>
          <div data-variant="underlined"><ComposeMessage variant="underlined" value={message} onChange={setMessage} /></div>
          <div data-variant="floating"><ComposeMessage variant="floating" value={message} onChange={setMessage} /></div>
          <div data-variant="inline"><ComposeMessage variant="inline" value={message} onChange={setMessage} /></div>
        </> : null}
      </Section>
      <Section id="e-receipts" title="E-receipts">
        <EReceipts items={[{title: 'Transfer to A. Rao', meta: '14 Jan · 1,250.00', value: 'PDF'}, {title: 'Electricity bill', meta: '10 Jan · 86.20', value: 'PDF'}]} />
      </Section>
      <Section id="certificates" title="Certificates">
        <Certificates items={[{title: 'Interest certificate', meta: 'Savings ·· 4821 · 2025', value: 'PDF'}, {title: 'Balance certificate', meta: 'As of 31 Dec', value: 'PDF'}, {title: 'TDS certificate', meta: 'FY 2025', value: 'PDF'}]} />
      </Section>
      <Section id="statement-request" title="Statement request">
        <StatementRequest value={period} onChange={setPeriod} maxDays={92} />
        {variantsShown ? <>
          <div data-variant="material"><StatementRequest variant="material" value={period} onChange={setPeriod} maxDays={92} /></div>
          <div data-variant="outlined"><StatementRequest variant="outlined" value={period} onChange={setPeriod} maxDays={92} /></div>
          <div data-variant="underlined"><StatementRequest variant="underlined" value={period} onChange={setPeriod} maxDays={92} /></div>
          <div data-variant="inline"><StatementRequest variant="inline" value={period} onChange={setPeriod} maxDays={92} /></div>
        </> : null}
      </Section>
      <Section id="statement-format" title="Statement format">
        <StatementFormat value={format} onChange={setFormat} />
        {variantsShown ? <>
          <div data-variant="material"><StatementFormat variant="material" value={format} onChange={setFormat} /></div>
          <div data-variant="ios"><StatementFormat variant="ios" value={format} onChange={setFormat} /></div>
          <div data-variant="underline"><StatementFormat variant="underline" value={format} onChange={setFormat} /></div>
          <div data-variant="enclosed"><StatementFormat variant="enclosed" value={format} onChange={setFormat} /></div>
          <div data-variant="pill"><StatementFormat variant="pill" value={format} onChange={setFormat} /></div>
        </> : null}
      </Section>
      <Section id="self-register" title="Self registration">
        <SelfRegister selectedStep="Verify" />
      </Section>
      <Section id="fatca-crs" title="FATCA and CRS">
        <TaxSelfCertification selectedStep="Tax residency" />
      </Section>
      <Section id="product-showcase" title="Product showcase">
        <ProductCard heading="Platinum credit card" text="2% cashback · no annual fee in year one" badge="New" actionLabel="Apply now →" />
      </Section>
      <Section id="application-tracker" title="Application tracker">
        <ApplicationTracker items={[{label: 'Submitted', meta: '12 Jan'}, {label: 'Documents checked', meta: '13 Jan'}, {label: 'Credit decision', meta: 'Expected 16 Jan', state: 'current'}, {label: 'Card sent', meta: '—', state: 'pending'}]} />
      </Section>
      <Section id="terms-consent" title="Terms consent">
        <TermsConsent options={['I accept the terms and conditions', 'Send me offers by email']} value={terms} onChange={setTerms} />
        {variantsShown ? <>
          <div data-variant="material"><TermsConsent variant="material" options={['I accept the terms and conditions', 'Send me offers by email']} value={terms} onChange={setTerms} /></div>
          <div data-variant="cards"><TermsConsent variant="cards" options={['I accept the terms and conditions', 'Send me offers by email']} value={terms} onChange={setTerms} /></div>
          <div data-variant="chips"><TermsConsent variant="chips" options={['I accept the terms and conditions', 'Send me offers by email']} value={terms} onChange={setTerms} /></div>
          <div data-variant="rows"><TermsConsent variant="rows" options={['I accept the terms and conditions', 'Send me offers by email']} value={terms} onChange={setTerms} /></div>
          <div data-variant="round"><TermsConsent variant="round" options={['I accept the terms and conditions', 'Send me offers by email']} value={terms} onChange={setTerms} /></div>
        </> : null}
      </Section>
      <Section id="loan-calculator" title="Loan calculator">
        <LoanCalculator currency="USD" actionLabel="Apply for this loan" />
      </Section>
      <Section id="eligibility-calculator" title="Eligibility calculator">
        <EligibilityCalculator value={income} onChange={setIncome} prefix="USD" helpText="You could borrow up to 60,000.00" />
        {variantsShown ? <>
          <div data-variant="material"><EligibilityCalculator variant="material" value={income} onChange={setIncome} prefix="USD" helpText="You could borrow up to 60,000.00" /></div>
          <div data-variant="ticks"><EligibilityCalculator variant="ticks" value={income} onChange={setIncome} prefix="USD" helpText="You could borrow up to 60,000.00" /></div>
          <div data-variant="bubble"><EligibilityCalculator variant="bubble" value={income} onChange={setIncome} prefix="USD" helpText="You could borrow up to 60,000.00" /></div>
          <div data-variant="thick"><EligibilityCalculator variant="thick" value={income} onChange={setIncome} prefix="USD" helpText="You could borrow up to 60,000.00" /></div>
        </> : null}
      </Section>
      <Section id="td-calculator" title="Deposit calculator">
        <DepositCalculator currency="USD" />
      </Section>
      <Section id="currency-converter" title="Currency converter">
        <ForexCalculator currency="USD" toCurrency="EUR" rate={0.92} />
      </Section>
      <Section id="goal-calculator" title="Goal calculator">
        <GoalCalculator value={saving} onChange={setSaving} prefix="USD" helpText="You reach 3,000.00 in 8 months" />
        {variantsShown ? <>
          <div data-variant="material"><GoalCalculator variant="material" value={saving} onChange={setSaving} prefix="USD" helpText="You reach 3,000.00 in 8 months" /></div>
          <div data-variant="ticks"><GoalCalculator variant="ticks" value={saving} onChange={setSaving} prefix="USD" helpText="You reach 3,000.00 in 8 months" /></div>
          <div data-variant="bubble"><GoalCalculator variant="bubble" value={saving} onChange={setSaving} prefix="USD" helpText="You reach 3,000.00 in 8 months" /></div>
          <div data-variant="thick"><GoalCalculator variant="thick" value={saving} onChange={setSaving} prefix="USD" helpText="You reach 3,000.00 in 8 months" /></div>
        </> : null}
      </Section>
      <Section id="locator" title="Locator">
        <Locator items={places} />
      </Section>
      <Section id="live-chat" title="Live chat">
        <LiveChat messages={chat} typing />
      </Section>
      <Section id="feedback" title="Feedback rating">
        <FeedbackRating label="How was this payment?" value={stars} onChange={setStars} />
      </Section>
      <Section id="nominations" title="Nominations">
        <Nominations items={[{title: 'S. Rao · spouse', meta: 'Savings ·· 4821', value: '50%'}, {title: 'K. Rao · son', meta: 'Savings ·· 4821', value: '50%'}]} />
      </Section>
      <Section id="faq" title="FAQ">
        <Faq items={faq} />
      </Section>
      <Section id="overview" title="Overview">
        <OverviewWidget items={[{label: 'Current and savings', value: '15,610.50', meta: '3 accounts'}, {label: 'Term deposits', value: '25,000.00', meta: '2 deposits'}, {label: 'Loans', value: '18,420.00', meta: '1 loan outstanding'}, {label: 'Credit cards', value: '640.00 due', meta: '2 cards'}, {label: 'Mutual funds', value: '4,120.00', meta: '1 fund'}]} />
      </Section>
      <Section id="quick-insights" title="Quick insights">
        <QuickInsightsWidget items={[{title: 'Term deposit matures', meta: 'In 5 days · ·· 9011', value: '25,000.00'}, {title: 'Card payment due', meta: '18 Jan · ·· 4821', value: '640.00'}, {title: 'Low balance', meta: 'Current ·· 7730', value: '210.00'}]} />
      </Section>
      <Section id="recent-transactions" title="Recent transactions">
        <RecentTransactionsWidget currency="USD" items={txns} />
      </Section>
      <Section id="bills-widget" title="Bills">
        <BillsWidget items={[{title: 'Electricity', meta: 'Due 20 Jan', value: '86.20'}, {title: 'Water', meta: 'Due 25 Jan', value: '24.10'}]} />
      </Section>
      <Section id="spend-analysis" title="Spend analysis">
        <SpendAnalysisWidget items={[{label: 'Groceries', value: 320}, {label: 'Travel', value: 180}, {label: 'Eating out', value: 210}, {label: 'Shopping', value: 140}]} unit="USD" />
      </Section>
      <Section id="goals" title="Goals">
        <GoalsWidget items={[{label: 'Holiday fund', value: 1800, max: 3000}, {label: 'New car', value: 4200, max: 15000}]} />
      </Section>
      <Section id="budgets" title="Budgets">
        <BudgetsWidget items={[{label: 'Groceries', value: 320, max: 400}, {label: 'Travel', value: 180, max: 300}, {label: 'Eating out', value: 210, max: 200}]} />
      </Section>
      <Section id="calculators" title="Calculators">
        <CalculatorsWidget currency="USD" />
      </Section>
      <Section id="credit-score" title="Credit score">
        <CreditScoreWidget items={[{label: 'Credit score', value: 742, max: 900}]} />
      </Section>
      <Section id="rewards" title="Rewards">
        <RewardsWidget items={[{label: 'Points', value: '12,400', meta: 'Redeem for merchandise, vouchers or air miles'}, {label: 'Vouchers', value: '3', meta: 'Expire 31 Mar'}, {label: 'Cashback', value: '45.00', meta: 'Paid on the 1st'}]} />
      </Section>
      <Section id="financial-advisor" title="Financial advisor">
        <FinancialAdvisorWidget heading="Priya Nair" text="priya.nair@bank.example · +44 20 7946 0123" badge="Relationship manager" />
      </Section>
      <Section id="special-offers" title="Special offers">
        <SpecialOffersWidget heading="Pre-approved personal loan" text="Up to 25,000.00 at 9.5% a year." badge="Offer" />
      </Section>
      <Section id="credit-cards-overview" title="Credit cards">
        <CreditCardsWidget items={[{label: 'Total due', value: '640.00', meta: 'Due 18 Jan'}, {label: 'Minimum due', value: '32.00', meta: 'Pay to avoid charges'}, {label: 'Available limit', value: '9,360.00', meta: 'Of 10,000.00'}]} />
      </Section>
      <Section id="loans-overview" title="Loans">
        <LoansWidget items={[{label: 'Loans', value: '2', meta: 'Home and car'}, {label: 'Outstanding', value: '18,420.00', meta: 'Next instalment 5 Feb'}, {label: 'Sanctioned', value: '30,000.00', meta: 'Both loans'}]} />
      </Section>
      <Section id="delinquency-notice" title="Delinquency notice">
        <DelinquencyNotice message="Your car loan ·· 3310 is 12 days overdue: 412.00." />
      </Section>
      <Section id="financial-overview" title="Financial overview">
        <FinancialOverviewWidget items={[{label: 'Assets', value: '4.2M', meta: 'CASA, deposits'}, {label: 'Liabilities', value: '1.1M', meta: 'Loans'}, {label: 'Net worth', value: '3.1M', meta: 'Assets less liabilities'}]} />
      </Section>
      <Section id="position-by-currency" title="Position by currency">
        <CurrencyPositionWidget items={[{label: 'USD', value: 88}, {label: 'EUR', value: 60}, {label: 'GBP', value: 42}, {label: 'INR', value: 30}, {label: 'AED', value: 18}]} note="In millions, assets" />
      </Section>
      <Section id="credit-line-usage" title="Credit line usage">
        <CreditLineWidget items={[{label: 'Working capital', value: 720, max: 1000}, {label: 'Import LC line', value: 300, max: 500}, {label: 'Guarantees', value: 90, max: 400}]} unit="k" />
      </Section>
      <Section id="bills-receivable-payable" title="Bills receivable and payable">
        <TradeBillsWidget items={[{label: 'Receivable', value: '1.8M', meta: 'Export bills'}, {label: 'Payable', value: '0.9M', meta: 'Import bills'}]} />
      </Section>
      <Section id="trade-instruments" title="Trade instruments">
        <TradeInstrumentsWidget items={[{title: 'LC ILC2201', meta: 'Expires in 9 days', value: '250,000.00'}, {title: 'Guarantee OG118', meta: 'Expires in 14 days', value: '80,000.00'}]} />
      </Section>
      <Section id="reports" title="Reports">
        <ReportsWidget items={[{title: 'Account statement · Dec', meta: 'Generated today', value: 'PDF'}, {title: 'Payments summary', meta: 'Yesterday', value: 'CSV'}]} />
      </Section>
      <Section id="accounts-corp" title="Accounts (corporate)">
        <AccountsWidget items={[{id: 'casa', label: 'Current and savings', summary: '12 accounts · 3.4M'}, {id: 'td', label: 'Term deposits', summary: '4 deposits · 1.2M'}, {id: 'loans', label: 'Loans and finances', summary: '2 loans · 1.1M outstanding'}]} />
      </Section>
      <Section id="corporate-limits" title="Corporate limits">
        <CorporateLimitsWidget items={[{label: 'Daily, own transfers', value: 420, max: 1000}, {label: 'Monthly, payments', value: 6200, max: 20000}]} unit="k" />
      </Section>
      <Section id="transactions-widget" title="Transactions (corporate)">
        <TransactionsWidget items={[{id: 'pending', label: 'Pending', summary: '6 waiting: 4 financial, 2 non-financial'}, {id: 'initiated', label: 'Initiated', summary: '3 initiated today'}, {id: 'log', label: 'Log', summary: '42 this week'}, {id: 'approved', label: 'Approved', summary: '18 approved today'}]} />
      </Section>
      <Section id="last-5-payments" title="Last 5 payments">
        <LastPaymentsWidget items={[{title: 'Payroll Jan', meta: 'Processed', value: '182,400.00', tone: 'success'}, {title: 'Vendor ABC Ltd', meta: 'In progress', value: '12,000.00'}, {title: 'Tax', meta: 'Rejected', value: '9,800.00', tone: 'danger'}]} />
      </Section>
      <Section id="bulk-file-upload" title="Bulk file upload">
        <BulkUploadWidget value={bulk} onChange={setBulk} />
        {variantsShown ? <>
          <div data-variant="material"><BulkUploadWidget variant="material" value={bulk} onChange={setBulk} /></div>
          <div data-variant="dropzone"><BulkUploadWidget variant="dropzone" value={bulk} onChange={setBulk} /></div>
          <div data-variant="compact"><BulkUploadWidget variant="compact" value={bulk} onChange={setBulk} /></div>
          <div data-variant="card"><BulkUploadWidget variant="card" value={bulk} onChange={setBulk} /></div>
        </> : null}
      </Section>
      <Section id="quick-links-corp" title="Quick links (corporate)">
        <QuickLinksWidget items={[{id: 'own', label: 'Own account', icon: '⇄'}, {id: 'transfer', label: 'Transfer', icon: '↗'}, {id: 'adhoc', label: 'Ad-hoc', icon: '+'}, {id: 'file', label: 'File upload', icon: '⇪'}]} />
      </Section>
      <Section id="work-snapshot" title="Work snapshot">
        <WorkSnapshotWidget items={[{label: 'Processed', value: '12', meta: 'Approved today'}, {label: 'In progress', value: '4', meta: 'Initiated today'}, {label: 'Rejected', value: '1', meta: 'Needs a fix'}]} />
      </Section>
      <Section id="notifications-widget" title="Notifications (corporate)">
        <NotificationsWidget items={[{title: 'USD cut-off moves to 3 pm', meta: 'Today', value: 'Bank'}, {title: 'New tax form available', meta: '2 days ago', value: 'Bank'}]} />
      </Section>
      <Section id="pending-for-action" title="Pending for action">
        <PendingActionWidget items={[{label: 'Payments', value: 70}, {label: 'Trade', value: 35}, {label: 'Accounts', value: 20}, {label: 'Limits', value: 10}]} unit="pending" />
      </Section>
      <Section id="my-limits" title="My limits">
        <MyLimitsWidget items={[{label: 'Initiate, per transaction', value: 50, max: 100}, {label: 'Approve, daily', value: 240, max: 500}]} unit="k" />
      </Section>
      <Section id="pending-approvals" title="Pending approvals">
        <PendingApprovalsWidget items={[{title: 'Payroll Feb · prioritized', meta: 'Financial · 182,400.00', value: 'PAY-4410'}, {title: 'Add payee J. Mehta', meta: 'Non-financial', value: 'BEN-218'}]} />
      </Section>
      <Section id="rolling-digits" title="Rolling digits">
        <RollingDigits value={12400.5} currency="USD" />
      </Section>
      <Section id="count-up" title="Count up">
        <CountUp value={1840.2} currency="USD" />
      </Section>
      <Section id="split-flap-board" title="Split-flap board">
        <SplitFlapBoard items={[{label: 'USD', value: '0.92 EUR'}, {label: 'GBP', value: '1.17 EUR'}]} />
      </Section>
      <Section id="reveal-digits" title="Reveal digits">
        <RevealDigits value="GB29 NWBK 6016 1331 9268 19" />
      </Section>
      <Section id="blur-in-text" title="Blur-in text">
        <BlurInText text="Your money, clearly." />
      </Section>
      <Section id="text-reveal" title="Text reveal">
        <TextReveal text="Welcome back, Asha" />
      </Section>
      <Section id="rotating-text" title="Rotating text">
        <RotatingText prefix="Pay" words={['bills', 'friends', 'cards']} />
      </Section>
      <Section id="shimmer-text" title="Shimmer text">
        <ShimmerText text="New: instant transfers" />
      </Section>
      <Section id="gradient-text" title="Gradient text">
        <GradientText text="Platinum" />
      </Section>
      <Section id="typed-text" title="Typed text">
        <TypedText text="You spent 320.00 on groceries this month, 40.00 less than last month." />
      </Section>
      <Section id="focus-word" title="Focus word">
        <FocusWord text="Save a little every day" />
      </Section>
      <Section id="scroll-float-text" title="Scroll float text">
        <ScrollFloatText text="Grow your savings" />
      </Section>
      <Section id="fade-in-content" title="Fade-in content">
        <FadeInContent effect="fadeup"><p>The screen's own content</p></FadeInContent>
      </Section>
      <Section id="scroll-reveal" title="Scroll reveal">
        <ScrollReveal effect="scale"><p>The screen's own content</p></ScrollReveal>
      </Section>
      <Section id="scroll-expand" title="Scroll expand">
        <ScrollExpand><p>The screen's own content</p></ScrollExpand>
      </Section>
      <Section id="edge-blur" title="Edge blur">
        <EdgeBlur><p>The screen's own content</p></EdgeBlur>
      </Section>
      <Section id="glare-hover" title="Glare hover">
        <GlareHover><p>The screen's own content</p></GlareHover>
      </Section>
      <Section id="magnetic-button" title="Magnetic button">
        <MagneticButton label="Open an account" />
        {variantsShown ? <>
          <div data-variant="material"><MagneticButton variant="material" label="Open an account" /></div>
          <div data-variant="tonal"><MagneticButton variant="tonal" label="Open an account" /></div>
          <div data-variant="outlined"><MagneticButton variant="outlined" label="Open an account" /></div>
          <div data-variant="text"><MagneticButton variant="text" label="Open an account" /></div>
          <div data-variant="elevated"><MagneticButton variant="elevated" label="Open an account" /></div>
          <div data-variant="gradient"><MagneticButton variant="gradient" label="Open an account" /></div>
          <div data-variant="glass"><MagneticButton variant="glass" label="Open an account" /></div>
          <div data-variant="pill"><MagneticButton variant="pill" label="Open an account" /></div>
        </> : null}
      </Section>
      <Section id="highlight-border" title="Highlight border">
        <HighlightBorder><p>The screen's own content</p></HighlightBorder>
      </Section>
      <Section id="click-burst" title="Click burst">
        <ClickBurst><p>The screen's own content</p></ClickBurst>
      </Section>
      <Section id="marquee" title="Marquee">
        <Marquee items={['USD 0.92 EUR', 'GBP 1.17 EUR', 'AED 0.25 EUR']} />
      </Section>
      <Section id="animated-list" title="Animated list">
        <AnimatedList label="Recent" items={['Coffee House', {title: 'Salary', meta: '31 Dec'}]} />
      </Section>
      <Section id="spotlight-card" title="Spotlight card">
        <SpotlightCard heading="Platinum card" text="2% cashback on travel" />
      </Section>
      <Section id="tilt-card" title="Tilt card">
        <TiltCard heading="Savings" text="12,400.00" />
      </Section>
      <Section id="flip-card" title="Flip card">
        <FlipCard heading="Platinum" front="2% cashback" back="No annual fee in year one; 1.5% on foreign spend." />
      </Section>
      <Section id="card-stack" title="Card stack">
        <CardStack items={[{title: 'Set a budget', text: 'See where your money goes'}, {title: 'Turn on alerts', text: 'Know when a payment leaves'}]} />
      </Section>
      <Section id="glow-border-card" title="Glow border card">
        <GlowBorderCard heading="Premium account" />
      </Section>
      <Section id="bento-grid" title="Bento grid">
        <BentoGrid label="Dashboard" items={[{id: 'spend', title: 'Spending', figure: '1,240.00', size: 'wide'}, {id: 'save', title: 'Saved', figure: '320.00'}, {id: 'score', title: 'Credit score', figure: '742'}]} />
      </Section>
      <Section id="carousel" title="Carousel">
        <Carousel slides={[{title: 'Travel insurance', text: 'Cover for the whole family'}, {title: 'Home loans', text: 'From 6.9% a year'}]} />
      </Section>
      <Section id="elastic-slider" title="Elastic slider">
        <ElasticSlider label="Amount" value={500} prefix="USD" />
        {variantsShown ? <>
          <div data-variant="material"><ElasticSlider variant="material" label="Amount" value={500} prefix="USD" /></div>
          <div data-variant="ticks"><ElasticSlider variant="ticks" label="Amount" value={500} prefix="USD" /></div>
          <div data-variant="bubble"><ElasticSlider variant="bubble" label="Amount" value={500} prefix="USD" /></div>
          <div data-variant="thick"><ElasticSlider variant="thick" label="Amount" value={500} prefix="USD" /></div>
        </> : null}
      </Section>
      <Section id="option-wheel" title="Option wheel">
        <OptionWheel label="Tenure" options={['3 months', '6 months', '12 months']} value="6 months" />
        {variantsShown ? <>
          <div data-variant="material"><OptionWheel variant="material" label="Tenure" options={['3 months', '6 months', '12 months']} value="6 months" /></div>
          <div data-variant="outlined"><OptionWheel variant="outlined" label="Tenure" options={['3 months', '6 months', '12 months']} value="6 months" /></div>
          <div data-variant="underlined"><OptionWheel variant="underlined" label="Tenure" options={['3 months', '6 months', '12 months']} value="6 months" /></div>
          <div data-variant="inline"><OptionWheel variant="inline" label="Tenure" options={['3 months', '6 months', '12 months']} value="6 months" /></div>
          <div data-variant="pill"><OptionWheel variant="pill" label="Tenure" options={['3 months', '6 months', '12 months']} value="6 months" /></div>
        </> : null}
      </Section>
      <Section id="pill-nav" title="Pill navigation">
        <PillNav items={['Accounts', 'Payments', 'Cards']} selection="Accounts" />
      </Section>
      <Section id="dock-nav" title="Dock navigation">
        <DockNav items={[{id: 'pay', label: 'Pay', icon: '↗'}, {id: 'cards', label: 'Cards', icon: '▭'}, {id: 'help', label: 'Help', icon: '?'}]} />
      </Section>
      <Section id="card-nav" title="Card navigation">
        <CardNav items={[{id: 'loans', title: 'Loans', text: 'Home, car, personal'}, {id: 'cards', title: 'Cards', text: 'Credit and debit'}]} />
      </Section>
      <Section id="staggered-menu" title="Staggered menu">
        <StaggeredMenu items={['Statements', 'Settings', 'Sign out']} />
      </Section>
      <Section id="document-folder" title="Document folder">
        <DocumentFolder items={[{id: 'd1', title: 'Statement December', meta: 'PDF · 120 KB'}, {id: 'd2', title: 'Tax certificate 2025', meta: 'PDF'}]} />
      </Section>
      <Section id="scroll-stack" title="Scroll stack">
        <ScrollStack items={[{title: 'Choose an account', text: 'Savings or current'}, {title: 'Verify', text: 'Your ID and a selfie'}]} />
      </Section>
      <Section id="profile-card" title="Profile card">
        <ProfileCard name="Priya Nair" jobTitle="Relationship manager" items={[{label: 'Phone', value: '+44 20 7946 0123'}]} actionLabel="Send a message" />
      </Section>
      <Section id="glass-panel" title="Glass panel">
        <GlassPanel><p>The screen's own content</p></GlassPanel>
      </Section>
      <Section id="gradient-backdrop" title="Gradient backdrop">
        <GradientBackdrop><p>The screen's own content</p></GradientBackdrop>
      </Section>
      <Section id="soft-aurora" title="Soft aurora">
        <SoftAurora><p>The screen's own content</p></SoftAurora>
      </Section>
      <Section id="silk-backdrop" title="Silk backdrop">
        <SilkBackdrop><p>The screen's own content</p></SilkBackdrop>
      </Section>
      <Section id="dot-grid" title="Dot grid">
        <DotGrid><p>The screen's own content</p></DotGrid>
      </Section>
      <Section id="line-waves" title="Line waves">
        <LineWaves><p>The screen's own content</p></LineWaves>
      </Section>
      <Section id="light-beams" title="Light beams">
        <LightBeams><p>The screen's own content</p></LightBeams>
      </Section>
      <Section id="topography" title="Topography">
        <Topography><p>The screen's own content</p></Topography>
      </Section>
      <Section id="particle-backdrop" title="Particle backdrop">
        <ParticleBackdrop><p>The screen's own content</p></ParticleBackdrop>
      </Section>
      <Section id="slide-to-confirm" title="Slide to confirm">
        <SlideToConfirm label="Slide to pay 1,250.00" />
        {variantsShown ? <>
          <div data-variant="material"><SlideToConfirm variant="material" label="Slide to pay 1,250.00" /></div>
          <div data-variant="tonal"><SlideToConfirm variant="tonal" label="Slide to pay 1,250.00" /></div>
          <div data-variant="outlined"><SlideToConfirm variant="outlined" label="Slide to pay 1,250.00" /></div>
          <div data-variant="text"><SlideToConfirm variant="text" label="Slide to pay 1,250.00" /></div>
          <div data-variant="elevated"><SlideToConfirm variant="elevated" label="Slide to pay 1,250.00" /></div>
          <div data-variant="gradient"><SlideToConfirm variant="gradient" label="Slide to pay 1,250.00" /></div>
          <div data-variant="glass"><SlideToConfirm variant="glass" label="Slide to pay 1,250.00" /></div>
          <div data-variant="pill"><SlideToConfirm variant="pill" label="Slide to pay 1,250.00" /></div>
        </> : null}
      </Section>
      <Section id="hold-to-confirm" title="Hold to confirm">
        <HoldToConfirm label="Hold to close the account" />
        {variantsShown ? <>
          <div data-variant="material"><HoldToConfirm variant="material" label="Hold to close the account" /></div>
          <div data-variant="tonal"><HoldToConfirm variant="tonal" label="Hold to close the account" /></div>
          <div data-variant="outlined"><HoldToConfirm variant="outlined" label="Hold to close the account" /></div>
          <div data-variant="text"><HoldToConfirm variant="text" label="Hold to close the account" /></div>
          <div data-variant="elevated"><HoldToConfirm variant="elevated" label="Hold to close the account" /></div>
          <div data-variant="gradient"><HoldToConfirm variant="gradient" label="Hold to close the account" /></div>
          <div data-variant="glass"><HoldToConfirm variant="glass" label="Hold to close the account" /></div>
          <div data-variant="pill"><HoldToConfirm variant="pill" label="Hold to close the account" /></div>
        </> : null}
      </Section>
      <Section id="otp-slots" title="OTP slots">
        <OtpSlots value="12" />
        {variantsShown ? <>
          <div data-variant="material"><OtpSlots variant="material" value="12" /></div>
          <div data-variant="underline"><OtpSlots variant="underline" value="12" /></div>
          <div data-variant="rounded"><OtpSlots variant="rounded" value="12" /></div>
          <div data-variant="joined"><OtpSlots variant="joined" value="12" /></div>
        </> : null}
      </Section>
      <Section id="receipt-tear" title="Torn receipt">
        <ReceiptTear amount={1250} currency="USD" reference="FX-20391" />
      </Section>
      <Section id="success-check" title="Success check">
        <SuccessCheck label="Payment sent" text="1,250.00 USD to A. Rao" />
      </Section>
      <Section id="swipe-row" title="Swipe row">
        <SwipeRow heading="Coffee House" meta="Today 08:14" value="-4.50" actions={[{value: 'split', label: 'Split'}, {value: 'dispute', label: 'Dispute', tone: 'danger'}]} />
      </Section>
      <Section id="swipe-toast" title="Swipe toast">
        <SwipeToast message="Saved as a payee" />
      </Section>
      <Section id="bell-toggle" title="Bell toggle">
        <BellToggle value />
        {variantsShown ? <>
          <div data-variant="material"><BellToggle variant="material" value /></div>
          <div data-variant="ios"><BellToggle variant="ios" value /></div>
          <div data-variant="fluent"><BellToggle variant="fluent" value /></div>
          <div data-variant="labelled"><BellToggle variant="labelled" value /></div>
          <div data-variant="squish"><BellToggle variant="squish" value /></div>
        </> : null}
      </Section>
      <Section id="squish-switch" title="Squish switch">
        <SquishSwitch label="Round up to save" value />
        {variantsShown ? <>
          <div data-variant="material"><SquishSwitch variant="material" label="Round up to save" value /></div>
          <div data-variant="ios"><SquishSwitch variant="ios" label="Round up to save" value /></div>
          <div data-variant="fluent"><SquishSwitch variant="fluent" label="Round up to save" value /></div>
          <div data-variant="labelled"><SquishSwitch variant="labelled" label="Round up to save" value /></div>
          <div data-variant="squish"><SquishSwitch variant="squish" label="Round up to save" value /></div>
        </> : null}
      </Section>
      <Section id="jelly-radio" title="Jelly radio">
        <JellyRadio label="Card design" options={['Midnight', 'Ocean', 'Sunrise']} value="Ocean" />
        {variantsShown ? <>
          <div data-variant="material"><JellyRadio variant="material" label="Card design" options={['Midnight', 'Ocean', 'Sunrise']} value="Ocean" /></div>
          <div data-variant="cards"><JellyRadio variant="cards" label="Card design" options={['Midnight', 'Ocean', 'Sunrise']} value="Ocean" /></div>
          <div data-variant="chips"><JellyRadio variant="chips" label="Card design" options={['Midnight', 'Ocean', 'Sunrise']} value="Ocean" /></div>
          <div data-variant="rows"><JellyRadio variant="rows" label="Card design" options={['Midnight', 'Ocean', 'Sunrise']} value="Ocean" /></div>
        </> : null}
      </Section>
      <Section id="glide-select" title="Glide select">
        <GlideSelect label="Show" options={['Day', 'Week', 'Month']} value="Week" />
        {variantsShown ? <>
          <div data-variant="material"><GlideSelect variant="material" label="Show" options={['Day', 'Week', 'Month']} value="Week" /></div>
          <div data-variant="ios"><GlideSelect variant="ios" label="Show" options={['Day', 'Week', 'Month']} value="Week" /></div>
          <div data-variant="underline"><GlideSelect variant="underline" label="Show" options={['Day', 'Week', 'Month']} value="Week" /></div>
          <div data-variant="enclosed"><GlideSelect variant="enclosed" label="Show" options={['Day', 'Week', 'Month']} value="Week" /></div>
          <div data-variant="pill"><GlideSelect variant="pill" label="Show" options={['Day', 'Week', 'Month']} value="Week" /></div>
        </> : null}
      </Section>
      <Section id="rubber-segment" title="Rubber segment">
        <RubberSegment label="Period" options={['1M', '3M', '1Y']} value="1M" />
        {variantsShown ? <>
          <div data-variant="material"><RubberSegment variant="material" label="Period" options={['1M', '3M', '1Y']} value="1M" /></div>
          <div data-variant="ios"><RubberSegment variant="ios" label="Period" options={['1M', '3M', '1Y']} value="1M" /></div>
          <div data-variant="underline"><RubberSegment variant="underline" label="Period" options={['1M', '3M', '1Y']} value="1M" /></div>
          <div data-variant="enclosed"><RubberSegment variant="enclosed" label="Period" options={['1M', '3M', '1Y']} value="1M" /></div>
          <div data-variant="pill"><RubberSegment variant="pill" label="Period" options={['1M', '3M', '1Y']} value="1M" /></div>
        </> : null}
      </Section>
      <Section id="scrub-field" title="Scrub field">
        <ScrubField value={250} currency="USD" />
        {variantsShown ? <>
          <div data-variant="material"><ScrubField variant="material" value={250} currency="USD" /></div>
          <div data-variant="outlined"><ScrubField variant="outlined" value={250} currency="USD" /></div>
          <div data-variant="underlined"><ScrubField variant="underlined" value={250} currency="USD" /></div>
          <div data-variant="floating"><ScrubField variant="floating" value={250} currency="USD" /></div>
          <div data-variant="inline"><ScrubField variant="inline" value={250} currency="USD" /></div>
        </> : null}
      </Section>
      <Section id="budget-gauge" title="Budget gauge">
        <BudgetGauge label="Groceries" value={320} max={400} unit="USD" />
      </Section>
      <Section id="status-mark" title="Status mark">
        <StatusMark label="Approved" status="success" />
      </Section>
      <Section id="favourite-heart" title="Favourite heart">
        <FavouriteHeart name="A. Rao" value />
        {variantsShown ? <>
          <div data-variant="material"><FavouriteHeart variant="material" name="A. Rao" value /></div>
          <div data-variant="ios"><FavouriteHeart variant="ios" name="A. Rao" value /></div>
          <div data-variant="fluent"><FavouriteHeart variant="fluent" name="A. Rao" value /></div>
          <div data-variant="labelled"><FavouriteHeart variant="labelled" name="A. Rao" value /></div>
          <div data-variant="squish"><FavouriteHeart variant="squish" name="A. Rao" value /></div>
        </> : null}
      </Section>
      <Section id="peek-rating" title="Peek rating">
        <PeekRating label="How was this payment?" value={4} />
      </Section>
      <Section id="warm-tooltip" title="Warm tooltip">
        <WarmTooltip label="Reward points" text="Points expire after 2 years." />
      </Section>
      <Section id="prompt-bar" title="Prompt bar">
        <PromptBar suggestions={['What did I spend on travel?', 'When is my card bill due?']} />
      </Section>
      <Section id="voice-pill" title="Voice pill">
        <VoicePill listening={false} />
        {variantsShown ? <>
          <div data-variant="material"><VoicePill variant="material" listening={false} /></div>
          <div data-variant="tonal"><VoicePill variant="tonal" listening={false} /></div>
          <div data-variant="outlined"><VoicePill variant="outlined" listening={false} /></div>
          <div data-variant="text"><VoicePill variant="text" listening={false} /></div>
          <div data-variant="elevated"><VoicePill variant="elevated" listening={false} /></div>
          <div data-variant="gradient"><VoicePill variant="gradient" listening={false} /></div>
          <div data-variant="glass"><VoicePill variant="glass" listening={false} /></div>
          <div data-variant="pill"><VoicePill variant="pill" listening={false} /></div>
        </> : null}
      </Section>
      <Section id="call-chip" title="Call chip">
        <CallChip number="+44 20 7946 0000" />
        {variantsShown ? <>
          <div data-variant="material"><CallChip variant="material" number="+44 20 7946 0000" /></div>
          <div data-variant="tonal"><CallChip variant="tonal" number="+44 20 7946 0000" /></div>
          <div data-variant="outlined"><CallChip variant="outlined" number="+44 20 7946 0000" /></div>
          <div data-variant="text"><CallChip variant="text" number="+44 20 7946 0000" /></div>
          <div data-variant="elevated"><CallChip variant="elevated" number="+44 20 7946 0000" /></div>
          <div data-variant="gradient"><CallChip variant="gradient" number="+44 20 7946 0000" /></div>
          <div data-variant="glass"><CallChip variant="glass" number="+44 20 7946 0000" /></div>
          <div data-variant="pill"><CallChip variant="pill" number="+44 20 7946 0000" /></div>
        </> : null}
      </Section>
      <Section id="lattice-loader" title="Lattice loader">
        <LatticeLoader label="Loading your accounts" />
      </Section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
