# Handoff: React Native group 1 props renamed to the web packs' names

Commit: see `git log` on branch `claude/catalogue-phone-304429` ("React Native group 1 props as the web packs name them"), after the merge of
`redesign-overnight` (67821fa).

## Changed

The web packs' G1 (`react/src/G1.tsx` on `redesign-overnight`, d0b186c) is the reference. React Native now takes the same prop
names and value shapes; the old names are gone (no aliases).

| Component | Before | Now (as the web) |
|---|---|---|
| Slider | `currency` | `prefix`, `decimals`; `max` 100 unless set |
| ToggleGroup, FilterChips | options `string \| {value, label}` | options `ItemLike` (string, or `{id, label, title, value, disabled}`); FilterChips `single` → `multiple` (true unless set) |
| ActionMenu | `actions: {id, label, danger}`, `onAction(id)` | `items: (string \| MenuItem)[]`, `onAction(value)` |
| Accordion | `sections`, `value`, `onChange`, `single` (several open by default) | `items: PanelItem[]`, `expanded`, `onExpandedChange`, `multiple` (one at a time by default) |
| Stepper | `steps: string[]`, `value` (index) | `steps: (string \| StepItem)[]` with `state` done, current, next, failed; `selectedStep` (id); `label` "Progress" unless set |
| Drawer (web SideNav) | `value`, `onChange`, items `{value, label}` | `selection`, `onSelectionChange`, items `string \| NavItem` (with `badge`); keeps `open`, `onOpenChange` |
| BottomSheet (web Sheet) | `title` | `heading`, and `footer` |
| Stack (web Grid) | `columns` 1–4, `gap` a number | `columns` 1–4 or `auto` (one on a phone, two on a tablet), `gap` sm, md, lg |
| Avatar | `photo`, `size` a number | `src`, `size` sm, md, lg |
| Pagination | `value`, `onChange` | `page`, `onPageChange` |
| Timeline | `events: {title, detail, state: done\|current\|todo}` | `items: {id, label, meta, state: done\|current\|pending\|failed}`; `label` "Timeline" unless set |
| ActivityIndicator (web Spinner) | `size` small, large | `size` sm, md, lg |
| Skeleton | | adds `shape` text, card, circle |
| EmptyState | `title`, `body` | `heading`, `text`, `icon` |
| Tooltip | `testID` required | optional |
| Alert, ErrorMessage, SuccessMessage | `label`, `detail`, `tone`, `onClose` shows a close button | `heading`, `message`, `severity` (error, warning, confirmation, info), `dismissible` and `onClose` |
| NotificationPanel (web Rows) | `label`, `onRead`, items with `side` | `heading`, `actionLabel` ("Read"), `onAction`, `emptyText`; items `{id, title, meta, value, tone, unread}` |

Row buttons are named "Action: row" as on the web (for example "Pay: Electricity").

### What G2–G6 took with it

They are built on the same shared parts, so these changed too (the web G2–G6 are not merged yet; their other props are
compared when they land):

- Lists (UpcomingBills, CardStatements, ApprovalQueue, Devices, Consents, Mailbox, EReceipts, Certificates, Nominations,
  Locator, QuickInsightsWidget): items' `side` → `value`.
- Timelines (DisbursementTimeline, ApprovalJourney, SessionSummary, TrackRequests, ApplicationTracker): `events` → `items`
  with `label`, `meta`, `pending`.
- Steps (PaymentStatus, KycSteps, SelfRegister, TaxSelfCertification): `value` index → `selectedStep`.
- Banners (FraudAlert, ModificationNotice, DelinquencyNotice): `label`/`detail` → `heading`/`message`, `tone` → `severity`.
- Faq: one section open at a time (now the default); SpendCategories uses `multiple={false}`.
- EligibilityCalculator, GoalCalculator keep `currency` and pass the slider `prefix` and `decimals`.

### motion.json

Taken from `redesign-overnight` (48 entries) with `"react-native": true` on 47; `breadcrumb` stays false, React Native has no
breadcrumb.

## For the shared files (the main session applies these)

- **catalogue.json**: the React Native `api` blocks of G1, and of the G2–G6 components above, take these names.
- **Exports**: done (`MenuItem`, `NavItem`, `PanelItem`, `ListEntry`, `ItemLike`, `StepItem`, `StepState`, `TimelineItem`, `toItems`; `MenuAction`,
  `Section`, `Event` are gone).

## Checks run

- `npm run check` in `target-packs/components/react-native`: typecheck clean, Jest 11 suites, 122/122. The React Native gates gallery
  typechecks against the new names.

## Open questions for the user

- None.
