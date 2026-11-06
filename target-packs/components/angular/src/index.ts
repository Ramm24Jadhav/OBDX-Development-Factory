/*
 * obdx-angular: the premium Angular components for a bank's OBDX UI. Standalone components; add 'src/bx.css' to the
 * app's styles once (the same skin as the premium JET pack) and put styleClasses(style) on the app's root element.
 */
export { Button, IconButton } from './button';
export type { Chroming } from './button';
export { AmountInput, TextField, decimalsOf, formatAmount } from './text-field';
export { Dropdown } from './dropdown';
export { CheckboxGroup, RadioGroup } from './choices';
export { DatePicker } from './date-picker';
export { Dialog } from './dialog';
export { Toast } from './toast';
export type { Message, Severity } from './toast';
export { Card } from './card';
export { Tabs } from './tabs';
export type { Tab } from './tabs';
export { DataTable } from './data-table';
export type { Column } from './data-table';
export { EFFECTS, play, reducedMotion } from './motion';
export type { Effect } from './motion';
export { styleClasses } from './style';
export type { ComponentStyle } from './style';
export type { Option } from './field';
export { Autocomplete, CURRENCIES, CurrencySelector, DateRangePicker, FileUpload, MultiSelect, NumberInput, PasswordField, SearchField, TextArea, Toggle,
  fileSize } from './forms';
export type { DateRange } from './forms';
export { ActionMenu, Alert, Breadcrumb, Divider, EmptyState, ErrorMessage, G1_COMPONENTS, Grid, NotificationPanel, Pagination, SecondaryButton, Sheet, SideNav, Slider, Spinner,
  StatusBadge, Stepper, SuccessMessage, Timeline, ToggleGroup, Tooltip } from './g1';
export type { Item, ItemLike, MenuItem, NavItem, PanelItem, RowItem, StepItem, StepState, TimelineItem, Tone } from './g1';
export { AccountBalance, AccountCard, AccountDetails, AccountNumber, AccountSelector, AccountSummary, BeneficiaryCard, BeneficiarySelector, DepositRedemption, DepositTopUp,
  DepositsSummary, G2_COMPONENTS, MaturityInstructions, NewDepositForm, PaymentForm, PaymentStatus, TransactionDetails, TransactionFilter, TransactionHistory, TransactionReceipt,
  TransferSummary, ibanValid, money } from './g2';
export type { AccountOption, ChoiceOption, Detail, Payee, Tile, Transaction } from './g2';
export { AddOnCard, BlockCard, CardList, CardStatements, ConvertToEmi, DisbursementTimeline, G3_COMPONENTS, LoanRepayment, LoansSummary, OtpInput, PromiseToPay, RaiseDispute,
  RedeemPoints, RepaymentSchedule, SecureConfirmation, SensitiveField, SessionExpiryWarning, masked } from './g3';
export type { ScheduleColumn } from './g3';
export { AccountStructure, AlertSubscriptions, Appearance, ApprovalDetail, ApprovalJourney, ApprovalQueue, CodeDelivery, Consents, Devices, DoNotDisturb, G4_COMPONENTS,
  LanguagePicker, LendLimits, ModificationNotice, PendingRelease, Profile, ProgressBar, Reroute, SessionSummary, SignInOptions, SpendCategories, SpendingChart, StructureSimulation,
  StructureType, SweepMonitor, TransactionLimits, step } from './g4';
export type { Bar, Meter, SwitchOption } from './g4';
export { ApplicationTracker, Certificates, ComposeMessage, DepositCalculator, EReceipts, EligibilityCalculator, Faq, FeedbackRating, G5_COMPONENTS, GoalCalculator, LiveChat,
  Locator, Mailbox, Nominations, ProductCard, RaiseRequest, SelfRegister, StatementFormat, StatementRequest, TaxSelfCertification, TermsConsent, TrackRequests, instalment,
  maturity } from './g5';
export type { ChatMessage, Period, Place } from './g5';
export { AccountsWidget, BulkUploadWidget, CorporateLimitsWidget, CreditLineWidget, CurrencyPositionWidget, FinancialOverviewWidget, G6_COMPONENTS, LastPaymentsWidget,
  MyLimitsWidget, NotificationsWidget, PendingActionWidget, PendingApprovalsWidget, QuickLinksWidget, ReportsWidget, TradeBillsWidget, TradeInstrumentsWidget, TransactionsWidget,
  WorkSnapshotWidget } from './g6';
export type { QuickItem, SummaryTab } from './g6';
export { AnimatedList, BellToggle, BentoGrid, BlurInText, BudgetGauge, CallChip, CardNav, CardStack, Carousel, ClickBurst, CountUp, DockNav, DocumentFolder, DotGrid, EdgeBlur,
  ElasticSlider, FadeInContent, FavouriteHeart, FlipCard, FocusWord, G7_COMPONENTS, GlareHover, GlassPanel, GlideSelect, GlowBorderCard, GradientBackdrop, GradientText,
  HighlightBorder, HoldToConfirm, JellyRadio, LatticeLoader, LightBeams, LineWaves, MagneticButton, Marquee, OptionWheel, OtpSlots, ParticleBackdrop, PeekRating, PillNav,
  ProfileCard, PromptBar, ReceiptTear, RevealDigits, RollingDigits, RotatingText, RubberSegment, ScrollExpand, ScrollFloatText, ScrollReveal, ScrollStack, ScrubField, ShimmerText,
  SilkBackdrop, SlideToConfirm, SoftAurora, SplitFlapBoard, SpotlightCard, SquishSwitch, StaggeredMenu, StatusMark, SuccessCheck, SwipeRow, SwipeToast, TextReveal, TiltCard,
  Topography, TypedText, VoicePill, WarmTooltip, stagger } from './g7';
export type { BentoTile, CardNavItem, DeckItem, FlapRow, FolderDoc, ListEntry, SwipeAction } from './g7';

import { AmountInput, TextField } from './text-field';
import { Button, IconButton } from './button';
import { CheckboxGroup, RadioGroup } from './choices';
import { Card } from './card';
import { DataTable } from './data-table';
import { DatePicker } from './date-picker';
import { Dialog } from './dialog';
import { Dropdown } from './dropdown';
import { Tabs } from './tabs';
import { Toast } from './toast';
import { G1_COMPONENTS } from './g1';
import { G2_COMPONENTS } from './g2';
import { G3_COMPONENTS } from './g3';
import { G4_COMPONENTS } from './g4';
import { G5_COMPONENTS } from './g5';
import { G6_COMPONENTS } from './g6';
import { G7_COMPONENTS } from './g7';
import { Autocomplete, CurrencySelector, DateRangePicker, FileUpload, MultiSelect, NumberInput, PasswordField, SearchField, TextArea, Toggle } from './forms';

/** Every component, for a screen's imports: [...OBDX_COMPONENTS]. */
export const OBDX_COMPONENTS = [Button, IconButton, TextField, AmountInput, Dropdown, CheckboxGroup, RadioGroup, DatePicker, Dialog, Toast, Card, Tabs,
  DataTable, TextArea, PasswordField, NumberInput, CurrencySelector, MultiSelect, Toggle, DateRangePicker, SearchField, Autocomplete, FileUpload, ...G1_COMPONENTS, ...G2_COMPONENTS, ...G3_COMPONENTS, ...G4_COMPONENTS, ...G5_COMPONENTS, ...G6_COMPONENTS, ...G7_COMPONENTS] as const;
