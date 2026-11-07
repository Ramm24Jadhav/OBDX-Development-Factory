/*
 * The gallery the browser gates run on: every foundation component in its main states, one <section
 * data-component="id"> each, in the theme the URL asks for (?mode=light|dark). Fixed data so screenshots are stable.
 */
// The gallery runs in JIT mode, like the unit tests (Analog compiles the decorators); a bank's build compiles AOT
import '@angular/compiler';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { Column, ComponentStyle, Message, OBDX_COMPONENTS, styleClasses } from '../src';
import '../src/bx.css';
import './gallery.css';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'dark' ? 'dark' : 'light';
// The factory's Component factory shows one section (?only=id, see index.html) in the design and motion its card has chosen
const look = (params.get('look') || 'elevated') as ComponentStyle['look'];
const motion = { hover: params.get('hover') || undefined, click: params.get('click') || undefined, scroll: params.get('scroll') || undefined } as ComponentStyle['motion'];

@Component({
  selector: 'gallery-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...OBDX_COMPONENTS],
  template: `
    <main [class]="rootClass" data-gallery-ready>
      <h1>obdx-angular foundation set</h1>
      <section class="gate" data-component="button" aria-labelledby="button-h"><h2 id="button-h">Button</h2><div class="gate-body"><div class="gate-row">
        <bx-button label="Pay now" /><bx-button label="Save draft" chroming="solid" /><bx-button label="Cancel" chroming="outlined" />
        <bx-button label="Details" chroming="borderless" /><bx-button label="Delete" chroming="danger" /><bx-button label="Paying" [busy]="true" />
      </div></div></section>
      <section class="gate" data-component="icon-button" aria-labelledby="ib-h"><h2 id="ib-h">Icon button</h2><div class="gate-body"><div class="gate-row">
        <bx-icon-button label="More actions" /><bx-icon-button label="Close" icon="close" chroming="outlined" /><bx-icon-button label="Disabled action" [disabled]="true" />
      </div></div></section>
      <section class="gate" data-component="text-field" aria-labelledby="tf-h"><h2 id="tf-h">Text field</h2><div class="gate-body">
        <bx-text-field testID="tf1" label="Beneficiary name" [(value)]="name" [required]="true" [maxLength]="40" [clearable]="true" helpText="As it appears on the account" />
        <bx-text-field testID="tf2" label="Reference" value="INV 2041" error="Use letters and numbers only." />
        <bx-text-field testID="tf3" label="Customer ID" value="CUST-00921" [readOnly]="true" />
      </div></section>
      <section class="gate" data-component="amount" aria-labelledby="am-h"><h2 id="am-h">Amount input</h2><div class="gate-body">
        <bx-amount testID="am1" label="Amount" currency="INR" locale="en-IN" [(value)]="amount" [required]="true" helpText="Up to 50,000.00 a day" />
        <bx-amount testID="am2" label="Amount" currency="KWD" locale="en-US" [value]="12.5" error="Enter at most 10.000." />
      </div></section>
      <section class="gate" data-component="select" aria-labelledby="dd-h"><h2 id="dd-h">Dropdown</h2><div class="gate-body">
        <bx-select testID="dd1" label="From account" [options]="accounts" [(value)]="account" [required]="true" />
        <bx-select testID="dd2" label="To account" [options]="accounts" value="" [disabled]="true" />
      </div></section>
      <section class="gate" data-component="checkbox-group" aria-labelledby="cg-h"><h2 id="cg-h">Checkbox group</h2><div class="gate-body">
        <bx-checkbox-group testID="cg" label="Send alerts by" [options]="channels" [(value)]="alerts" />
      </div></section>
      <section class="gate" data-component="choice-group" aria-labelledby="rg-h"><h2 id="rg-h">Radio group</h2><div class="gate-body">
        <bx-choice-group testID="rg" label="Transfer speed" [horizontal]="true" [options]="speeds" [(value)]="speed" />
      </div></section>
      <section class="gate" data-component="date" aria-labelledby="dp-h"><h2 id="dp-h">Date picker</h2><div class="gate-body">
        <bx-date testID="dp" label="Pay on" [(value)]="day" min="2026-11-10" max="2026-12-31" locale="en-GB" />
      </div></section>
      <section class="gate" data-component="dialog" aria-labelledby="dl-h"><h2 id="dl-h">Dialog</h2><div class="gate-body"><div class="gate-dialog">
        <bx-dialog [open]="true" dialogTitle="Delete A. Sharma?" description="You can add them again later.">
          <p>Payments scheduled to A. Sharma will stop.</p>
          <bx-button footer label="Cancel" chroming="outlined" /><bx-button footer label="Delete" chroming="danger" />
        </bx-dialog>
      </div></div></section>
      <section class="gate" data-component="toast" aria-labelledby="ts-h"><h2 id="ts-h">Toast</h2><div class="gate-body">
        <bx-toast display="general" [messages]="messages" />
      </div></section>
      <section class="gate" data-component="card" aria-labelledby="cd-h"><h2 id="cd-h">Card</h2><div class="gate-body"><div class="gate-row">
        <bx-card heading="Savings •••• 4521" subheading="Available balance">₹85,000.00</bx-card>
        <bx-card heading="Current •••• 0187" subheading="Open the account" [interactive]="true" [selected]="false">₹12,410.50</bx-card>
        <div data-variant="outlined"><bx-card variant="outlined" heading="Savings •••• 4521" subheading="Available balance">₹85,000.00</bx-card></div>
      </div></div></section>
      <section class="gate" data-component="tabs" aria-labelledby="tb-h"><h2 id="tb-h">Tabs</h2><div class="gate-body">
        <bx-tabs #t label="Accounts" [tabs]="tabs" [(selection)]="tab" />
        <p role="tabpanel" [id]="t.panelId(tab())" [attr.aria-labelledby]="t.tabId(tab())">{{ panel[tab()] }}</p>
      </div></section>
      <section class="gate" data-component="data-grid" aria-labelledby="dg-h"><h2 id="dg-h">Data table</h2><div class="gate-body">
        <bx-data-grid caption="Recent transactions" [rows]="rows" [columns]="columns" selectionMode="multiple" [(selected)]="selected" />
      </div></section>
      <section class="gate" data-component="text-area" aria-labelledby="ta-h"><h2 id="ta-h">Text area</h2><div class="gate-body">
        <bx-text-area testID="ta1" label="Remarks" [(value)]="remarks" [maxLength]="140" helpText="Shown on the payee's statement" />
        <bx-text-area testID="ta2" label="Reason" value="" [required]="true" error="Say why you are cancelling." />
      </div></section>
      <section class="gate" data-component="password" aria-labelledby="pw-h"><h2 id="pw-h">Password</h2><div class="gate-body">
        <bx-password testID="pw1" label="Password" [(value)]="secret" autoComplete="new-password" helpText="At least 8 characters, one number" />
        <bx-password testID="pw2" label="Transaction PIN" value="1234" autoComplete="one-time-code" error="The PIN is wrong. 2 tries left." />
      </div></section>
      <section class="gate" data-component="number-input" aria-labelledby="ni-h"><h2 id="ni-h">Number</h2><div class="gate-body">
        <bx-number-input testID="ni1" label="Cheque leaves" [(value)]="copies" [min]="1" [max]="5" helpText="Up to 5 books" />
        <bx-number-input testID="ni2" label="Tenure (months)" [value]="84" error="Enter 60 or less." />
      </div></section>
      <section class="gate" data-component="currency-picker" aria-labelledby="cp-h"><h2 id="cp-h">Currency</h2><div class="gate-body">
        <bx-currency-picker testID="cp1" label="Currency" [(value)]="currency" [required]="true" />
      </div></section>
      <section class="gate" data-component="multi-select" aria-labelledby="ms-h"><h2 id="ms-h">Multi select</h2><div class="gate-body">
        <bx-multi-select testID="ms1" label="Accounts on the statement" [options]="accounts" [(value)]="picked" helpText="Choose one or more" />
      </div></section>
      <section class="gate" data-component="switch" aria-labelledby="sw-h"><h2 id="sw-h">Switch</h2><div class="gate-body">
        <bx-switch testID="sw1" label="Paperless statements" [(value)]="paperless" helpText="We email them on the 1st" />
        <bx-switch testID="sw2" label="International use" [value]="false" [disabled]="true" />
      </div></section>
      <section class="gate" data-component="date-range" aria-labelledby="dr-h"><h2 id="dr-h">Date range</h2><div class="gate-body">
        <bx-date-range testID="dr1" label="Statement period" [(value)]="period" [maxDays]="92" helpText="Up to 3 months" />
      </div></section>
      <section class="gate" data-component="search" aria-labelledby="se-h"><h2 id="se-h">Search</h2><div class="gate-body">
        <bx-search testID="se1" label="Search transactions" [(value)]="query" placeholder="Payee, amount or reference" />
      </div></section>
      <section class="gate" data-component="autocomplete" aria-labelledby="ac-h"><h2 id="ac-h">Autocomplete</h2><div class="gate-body">
        <bx-autocomplete testID="ac1" label="Payee" [options]="payees" [(value)]="payee" />
      </div></section>
      <section class="gate" data-component="document-upload" aria-labelledby="du-h"><h2 id="du-h">Document upload</h2><div class="gate-body">
        <bx-document-upload testID="du1" label="Proof of address" [(value)]="proof" accept=".pdf,image/*" [maxSize]="5242880" helpText="A utility bill or a statement" />
      </div></section>
      <section class="gate" data-component="secondary-button" aria-labelledby="aw1-0-h"><h2 id="aw1-0-h">Secondary button</h2><div class="gate-body">
        <bx-secondary-button testID="sb1" label="Save for later" />
        <bx-secondary-button testID="sb2" label="Save for later" [disabled]="true" />
      </div></section>
      <section class="gate" data-component="savings-slider" aria-labelledby="aw1-1-h"><h2 id="aw1-1-h">Savings slider</h2><div class="gate-body">
        <bx-savings-slider testID="sl1" label="Monthly saving" [(value)]="saving" prefix="USD" [min]="1500" [max]="20000" [step]="500" />
      </div></section>
      <section class="gate" data-component="segmented" aria-labelledby="aw1-2-h"><h2 id="aw1-2-h">Segmented control</h2><div class="gate-body">
        <bx-segmented testID="sg1" label="Show" [options]="['Day', 'Week', 'Month']" [(value)]="show" />
      </div></section>
      <section class="gate" data-component="action-menu" aria-labelledby="aw1-3-h"><h2 id="aw1-3-h">Action menu</h2><div class="gate-body">
        <bx-action-menu testID="am1" [items]="['Download statement', 'Set a nickname', { value: 'close', label: 'Close the account', danger: true }]" />
      </div></section>
      <section class="gate" data-component="stepper" aria-labelledby="aw1-4-h"><h2 id="aw1-4-h">Stepper</h2><div class="gate-body">
        <bx-stepper testID="st1" [steps]="['Details', 'Review', 'Done']" selectedStep="Review" />
      </div></section>
      <section class="gate" data-component="breadcrumb" aria-labelledby="aw1-5-h"><h2 id="aw1-5-h">Breadcrumb</h2><div class="gate-body">
        <bx-breadcrumb testID="bc1" [items]="['Accounts', 'Savings ·· 4821', 'Statement']" />
      </div></section>
      <section class="gate" data-component="side-nav" aria-labelledby="aw1-6-h"><h2 id="aw1-6-h">Side navigation</h2><div class="gate-body">
        <bx-side-nav testID="sn1" [items]="['Accounts', 'Payments', { id: 'Cards', label: 'Cards', badge: 2 }]" [(selection)]="navSel" />
      </div></section>
      <section class="gate" data-component="sheet" aria-labelledby="aw1-7-h"><h2 id="aw1-7-h">Sheet</h2><div class="gate-body">
        <bx-secondary-button label="Filter" (action)="sheet.set(true)" />
        <bx-sheet testID="sh1" [(open)]="sheet" heading="Filter transactions"><p>Choose what to show.</p></bx-sheet>
      </div></section>
      <section class="gate" data-component="grid" aria-labelledby="aw1-8-h"><h2 id="aw1-8-h">Grid</h2><div class="gate-body">
        <bx-grid testID="gr1" [columns]="3"><bx-card heading="Savings" /><bx-card heading="Current" /><bx-card heading="Deposits" /></bx-grid>
      </div></section>
      <section class="gate" data-component="divider" aria-labelledby="aw1-9-h"><h2 id="aw1-9-h">Divider</h2><div class="gate-body">
        <bx-divider testID="dv1" />
        <bx-divider testID="dv2" label="Or" />
      </div></section>
      <section class="gate" data-component="pagination" aria-labelledby="aw1-10-h"><h2 id="aw1-10-h">Pagination</h2><div class="gate-body">
        <bx-pagination testID="pg1" [(page)]="page" [pageCount]="4" />
      </div></section>
      <section class="gate" data-component="status-badge" aria-labelledby="aw1-11-h"><h2 id="aw1-11-h">Status badge</h2><div class="gate-body">
        <bx-status-badge testID="sb1" label="Completed" tone="success" />
        <bx-status-badge label="Pending" tone="warning" />
        <bx-status-badge label="Rejected" tone="danger" />
      </div></section>
      <section class="gate" data-component="timeline" aria-labelledby="aw1-12-h"><h2 id="aw1-12-h">Timeline</h2><div class="gate-body">
        <bx-timeline testID="tl1" [items]="[{ label: 'Initiated', meta: '09:12 · A. Rao' }, { label: 'Approved', meta: '10:40 · Priya Nair' }, { label: 'Sent to the bank', meta: '10:41', state: 'current' }, { label: 'Completed', state: 'pending' }]" />
      </div></section>
      <section class="gate" data-component="spinner" aria-labelledby="aw1-13-h"><h2 id="aw1-13-h">Spinner</h2><div class="gate-body">
        <bx-spinner testID="sp1" />
        <bx-spinner testID="sp2" size="lg" label="Loading accounts" />
      </div></section>
      <section class="gate" data-component="empty-state" aria-labelledby="aw1-14-h"><h2 id="aw1-14-h">Empty state</h2><div class="gate-body">
        <bx-empty-state testID="es1" heading="No payees yet" text="Add one to pay faster next time." actionLabel="Add a payee" />
      </div></section>
      <section class="gate" data-component="tooltip" aria-labelledby="aw1-15-h"><h2 id="aw1-15-h">Tooltip</h2><div class="gate-body">
        <bx-tooltip testID="tt1" label="Available balance" text="What you can spend now: the balance less holds and pending card payments." />
      </div></section>
      <section class="gate" data-component="alert-banner" aria-labelledby="aw1-16-h"><h2 id="aw1-16-h">Alert banner</h2><div class="gate-body">
        <bx-alert-banner testID="ab1" message="Transfers after 6 pm arrive the next working day." />
        <bx-alert-banner testID="ab2" severity="warning" message="Your session ends in 2 minutes." [dismissible]="true" />
      </div></section>
      <section class="gate" data-component="error-message" aria-labelledby="aw1-17-h"><h2 id="aw1-17-h">Error message</h2><div class="gate-body">
        <bx-error-message testID="em1" message="The amount is more than your daily limit of 5,000.00." actionLabel="Change the amount" />
      </div></section>
      <section class="gate" data-component="success-message" aria-labelledby="aw1-18-h"><h2 id="aw1-18-h">Success message</h2><div class="gate-body">
        <bx-success-message testID="sm1" message="Payment sent. Reference FX-20391." actionLabel="View receipt" />
      </div></section>
      <section class="gate" data-component="notification-panel" aria-labelledby="aw1-19-h"><h2 id="aw1-19-h">Notification panel</h2><div class="gate-body">
        <bx-notification-panel testID="np1" [items]="notes" />
        <bx-notification-panel testID="np2" heading="Alerts" [items]="[]" emptyText="No alerts." />
      </div></section>
      <section class="gate" data-component="danger-button" aria-labelledby="ap-danger-button-h"><h2 id="ap-danger-button-h">Danger button</h2><div class="gate-body">
        <bx-danger-button testID="db1" label="Cancel payment" />
        <bx-danger-button testID="db2" label="Cancel payment" [busy]="true" />
      </div></section>
      <section class="gate" data-component="filter-chips" aria-labelledby="ap-filter-chips-h"><h2 id="ap-filter-chips-h">Filter chips</h2><div class="gate-body">
        <bx-filter-chips testID="fc1" label="Filter" [options]="['Card', 'Transfer', 'Bills', 'Salary']" [value]="['Card']" />
      </div></section>
      <section class="gate" data-component="accordion" aria-labelledby="ap-accordion-h"><h2 id="ap-accordion-h">Accordion</h2><div class="gate-body">
        <bx-accordion testID="ac1" [items]="[{ id: 'a', title: 'How long does a transfer take?', body: 'Same day inside the bank; up to 2 working days to other banks.' }, { id: 'b', title: 'Can I cancel a payment?', body: 'Yes, until it is sent.' }]" />
      </div></section>
      <section class="gate" data-component="avatar" aria-labelledby="ap-avatar-h"><h2 id="ap-avatar-h">Avatar</h2><div class="gate-body">
        <bx-avatar testID="av1" name="Asha Rao" />
        <bx-avatar testID="av2" name="J. Mehta" size="sm" />
        <bx-avatar testID="av3" name="S. Kapoor" size="lg" />
      </div></section>
      <section class="gate" data-component="skeleton" aria-labelledby="ap-skeleton-h"><h2 id="ap-skeleton-h">Skeleton</h2><div class="gate-body">
        <bx-skeleton testID="sk1" />
        <bx-skeleton testID="sk2" shape="card" [lines]="2" />
        <bx-skeleton testID="sk3" shape="circle" [lines]="1" />
      </div></section>
      <section class="gate" data-component="quick-actions" aria-labelledby="ap-quick-actions-h"><h2 id="ap-quick-actions-h">Quick actions</h2><div class="gate-body">
        <bx-quick-actions testID="qa1" [items]="[{ id: 'send', label: 'Send', icon: '↗' }, { id: 'bills', label: 'Pay bills', icon: '≡' }, { id: 'topup', label: 'Top up', icon: '+' }, { id: 'scan', label: 'Scan to pay', icon: '⌗' }]" />
      </div></section>
      <section class="gate" data-component="repeat" aria-labelledby="ap-repeat-h"><h2 id="ap-repeat-h">Repeat</h2><div class="gate-body">
        <bx-repeat testID="rp1" value="Once" />
      </div></section>
      <section class="gate" data-component="upcoming-bills" aria-labelledby="ap-upcoming-bills-h"><h2 id="ap-upcoming-bills-h">Upcoming bills</h2><div class="gate-body">
        <bx-upcoming-bills testID="ub1" [items]="[{ id: 'b1', title: 'Electricity', meta: 'Due 20 Jan', value: '86.20' }, { id: 'b2', title: 'Card ·· 4821', meta: 'Due 18 Jan', value: '640.00' }]" />
      </div></section>
      <section class="gate" data-component="account-picker" aria-labelledby="aw2-0-h"><h2 id="aw2-0-h">Account picker</h2><div class="gate-body">
        <bx-account-picker testID="ap1" [options]="accounts" [(value)]="account" />
      </div></section>
      <section class="gate" data-component="account-summary" aria-labelledby="aw2-1-h"><h2 id="aw2-1-h">Account summary</h2><div class="gate-body">
        <bx-account-summary testID="as1" [items]="[{ label: 'Savings', value: '12,400.00', meta: 'Available 12,150.00' }, { label: 'Current', value: '3,210.50', meta: 'Overdraft 1,000.00' }, { label: 'Deposits', value: '25,000.00', meta: 'Matures 14 Mar' }]" />
      </div></section>
      <section class="gate" data-component="balance-card" aria-labelledby="aw2-2-h"><h2 id="aw2-2-h">Balance card</h2><div class="gate-body">
        <bx-balance-card testID="bc1" label="Savings ·· 4821" [amount]="12400" currency="USD" meta="Available 12,150.00" />
        <bx-balance-card testID="bc2" label="Current ·· 7730" [amount]="3210.5" currency="USD" [amountHidden]="true" />
      </div></section>
      <section class="gate" data-component="account-card" aria-labelledby="aw2-3-h"><h2 id="aw2-3-h">Account card</h2><div class="gate-body">
        <bx-account-card testID="ac1" heading="Savings ·· 4821" text="Balance 12,400.00 · Available 12,150.00" badge="Primary" actionLabel="View details →" />
      </div></section>
      <section class="gate" data-component="account-details" aria-labelledby="aw2-4-h"><h2 id="aw2-4-h">Account details</h2><div class="gate-body">
        <bx-account-details [items]="[{ label: 'Account', value: 'Savings ·· 4821' }, { label: 'Branch', value: 'London Bridge' }, { label: 'IBAN', value: 'GB29 •••• 9268 19' }, { label: 'Holder', value: 'A. Rao' }]" actionLabel="Download statement" />
      </div></section>
      <section class="gate" data-component="iban" aria-labelledby="aw2-5-h"><h2 id="aw2-5-h">IBAN</h2><div class="gate-body">
        <bx-iban testID="ib1" label="Account number (IBAN)" [(value)]="iban" [required]="true" />
        <bx-iban testID="ib2" label="Account number (IBAN)" value="GB28NWBK60161331926819" error="Check the IBAN: it starts with the country code." />
      </div></section>
      <section class="gate" data-component="payee-list" aria-labelledby="aw2-6-h"><h2 id="aw2-6-h">Payee list</h2><div class="gate-body">
        <bx-payee-list testID="pl1" [items]="payeeRows" />
      </div></section>
      <section class="gate" data-component="beneficiary-card" aria-labelledby="aw2-7-h"><h2 id="aw2-7-h">Beneficiary card</h2><div class="gate-body">
        <bx-beneficiary-card testID="bf1" heading="A. Rao" text="GB29 •••• 9268 19 · added 12 Mar" badge="HSBC" actionLabel="Pay now →" />
      </div></section>
      <section class="gate" data-component="payment-form" aria-labelledby="aw2-8-h"><h2 id="aw2-8-h">Payment form</h2><div class="gate-body">
        <bx-payment-form testID="pf1" cancelLabel="Cancel"><bx-account-picker [options]="accounts" [(value)]="account" /><bx-amount label="Amount" currency="USD" /></bx-payment-form>
      </div></section>
      <section class="gate" data-component="transfer-summary" aria-labelledby="aw2-9-h"><h2 id="aw2-9-h">Transfer summary</h2><div class="gate-body">
        <bx-transfer-summary [items]="[{ label: 'From', value: 'Savings ·· 4821' }, { label: 'To', value: 'A. Rao · HSBC' }, { label: 'Amount', value: '1,250.00 USD' }, { label: 'Fee', value: '0.00' }, { label: 'Arrives', value: 'Today' }]" />
      </div></section>
      <section class="gate" data-component="payment-status" aria-labelledby="aw2-10-h"><h2 id="aw2-10-h">Payment status</h2><div class="gate-body">
        <bx-payment-status testID="ps1" [steps]="['Initiated', 'Approved', 'Sent', 'Completed']" selectedStep="Sent" />
      </div></section>
      <section class="gate" data-component="transaction-list" aria-labelledby="aw2-11-h"><h2 id="aw2-11-h">Transaction list</h2><div class="gate-body">
        <bx-transaction-list testID="tx1" currency="USD" [items]="txns" />
        <bx-transaction-list testID="tx2" heading="Last month" [items]="[]" />
      </div></section>
      <section class="gate" data-component="transaction-filter" aria-labelledby="aw2-12-h"><h2 id="aw2-12-h">Transaction filter</h2><div class="gate-body">
        <bx-transaction-filter testID="tf1" [options]="['Money in', 'Money out', 'Cards', 'Transfers']" [(value)]="txFilter" />
      </div></section>
      <section class="gate" data-component="transaction-details" aria-labelledby="aw2-13-h"><h2 id="aw2-13-h">Transaction details</h2><div class="gate-body">
        <bx-transaction-details [items]="[{ label: 'Description', value: 'Coffee House' }, { label: 'Date', value: 'Today 08:14' }, { label: 'Amount', value: '-4.50 USD' }, { label: 'Card', value: '·· 4821' }, { label: 'Reference', value: 'TX-88211' }]" actionLabel="Dispute it" />
      </div></section>
      <section class="gate" data-component="receipt" aria-labelledby="aw2-14-h"><h2 id="aw2-14-h">Receipt</h2><div class="gate-body">
        <bx-receipt testID="rc1" [amount]="1250" currency="USD" reference="FX-20391" [items]="[{ label: 'From', value: 'Savings ·· 4821' }, { label: 'To', value: 'A. Rao · HSBC' }]"><bx-secondary-button label="Download" /></bx-receipt>
      </div></section>
      <section class="gate" data-component="td-summary" aria-labelledby="aw2-15-h"><h2 id="aw2-15-h">Deposits summary</h2><div class="gate-body">
        <bx-td-summary testID="ts1" [interactive]="false" [items]="[{ label: 'Deposits', value: '4', meta: 'Total 62,500.00' }, { label: 'Interest earned', value: '1,840.20', meta: 'This year' }, { label: 'Next maturity', value: '14 Mar', meta: '·· 9011 · 25,000.00' }]" />
      </div></section>
      <section class="gate" data-component="new-td" aria-labelledby="aw2-16-h"><h2 id="aw2-16-h">New deposit</h2><div class="gate-body">
        <bx-new-td testID="nt1" [items]="[{ label: 'From account', value: 'Savings ·· 4821' }, { label: 'Amount (USD)', value: '10,000.00' }, { label: 'Tenure', value: '12 months' }]" />
      </div></section>
      <section class="gate" data-component="maturity-instructions" aria-labelledby="aw2-17-h"><h2 id="aw2-17-h">Maturity instructions</h2><div class="gate-body">
        <bx-maturity-instructions testID="mi1" [options]="['Renew principal and interest', 'Renew principal, pay out interest', 'Close and pay out']" [(value)]="maturity" />
      </div></section>
      <section class="gate" data-component="td-topup" aria-labelledby="aw2-18-h"><h2 id="aw2-18-h">Deposit top-up</h2><div class="gate-body">
        <bx-td-topup [items]="[{ label: 'Deposit', value: '·· 9011' }, { label: 'Current amount', value: '25,000.00' }, { label: 'Top-up', value: '5,000.00' }, { label: 'New maturity value', value: '31,950.00', total: true }]" />
      </div></section>
      <section class="gate" data-component="td-redemption" aria-labelledby="aw2-19-h"><h2 id="aw2-19-h">Deposit redemption</h2><div class="gate-body">
        <bx-td-redemption [items]="[{ label: 'Deposit', value: '·· 9011' }, { label: 'Principal', value: '25,000.00' }, { label: 'Interest to date', value: '612.40' }, { label: 'Early penalty', value: '-62.50' }, { label: 'You receive', value: '25,549.90', total: true }]" />
      </div></section>
      <section class="gate" data-component="loan-summary" aria-labelledby="aw3-0-h"><h2 id="aw3-0-h">Loans summary</h2><div class="gate-body">
        <bx-loan-summary [items]="[{label: 'Home loan', value: '142,300.00', meta: 'Next 1,240.00 on 5 Feb'}, {label: 'Car loan', value: '18,420.00', meta: 'Next 412.00 on 5 Feb'}, {label: 'Overdue', value: '412.00', meta: 'Car loan · 12 days'}]" />
      </div></section>
      <section class="gate" data-component="loan-repayment" aria-labelledby="aw3-1-h"><h2 id="aw3-1-h">Loan repayment</h2><div class="gate-body">
        <bx-loan-repayment [items]="[{label: 'Loan', value: 'Car loan ·· 3310'}, {label: 'Amount (USD)', value: '412.00'}, {label: 'Pay from', value: 'Savings ·· 4821'}]" />
      </div></section>
      <section class="gate" data-component="loan-schedule" aria-labelledby="aw3-2-h"><h2 id="aw3-2-h">Repayment schedule</h2><div class="gate-body">
        <bx-loan-schedule testID="ls1" [rows]="[{date: '05 Feb', amount: '412.00', status: 'due'}, {date: '05 Mar', amount: '412.00'}, {date: '05 Apr', amount: '412.00'}]" />
      </div></section>
      <section class="gate" data-component="promise-to-pay" aria-labelledby="aw3-3-h"><h2 id="aw3-3-h">Promise to pay</h2><div class="gate-body">
        <bx-promise-to-pay [items]="[{label: 'Overdue', value: '412.00'}, {label: 'Promise date', value: '20 Jan'}, {label: 'Pay from', value: 'Savings ·· 4821'}]" />
      </div></section>
      <section class="gate" data-component="disbursement" aria-labelledby="aw3-4-h"><h2 id="aw3-4-h">Disbursement timeline</h2><div class="gate-body">
        <bx-disbursement [items]="[{label: 'Sanctioned 30,000.00', meta: '02 Jan'}, {label: 'First disbursement 20,000.00', meta: '05 Jan'}, {label: 'Second disbursement 10,000.00', meta: 'Due 05 Mar', state: 'pending'}]" />
      </div></section>
      <section class="gate" data-component="card-list" aria-labelledby="aw3-5-h"><h2 id="aw3-5-h">Card list</h2><div class="gate-body">
        <bx-card-list [items]="[{label: 'Platinum ·· 4821', value: '640.00 due', meta: 'Limit 10,000.00 · due 18 Jan'}, {label: 'Classic ·· 7710', value: '0.00 due', meta: 'Limit 3,000.00'}]" />
      </div></section>
      <section class="gate" data-component="convert-emi" aria-labelledby="aw3-6-h"><h2 id="aw3-6-h">Convert to EMI</h2><div class="gate-body">
        <bx-convert-emi testID="ce1" label="Pay 1,200.00 over" [(value)]="emi" />
      </div></section>
      <section class="gate" data-component="redeem-points" aria-labelledby="aw3-7-h"><h2 id="aw3-7-h">Redeem points</h2><div class="gate-body">
        <bx-redeem-points testID="rd1" [(value)]="points" />
      </div></section>
      <section class="gate" data-component="block-card" aria-labelledby="aw3-8-h"><h2 id="aw3-8-h">Block card</h2><div class="gate-body">
        <bx-block-card testID="bk1" [(value)]="blocked" />
      </div></section>
      <section class="gate" data-component="raise-dispute" aria-labelledby="aw3-9-h"><h2 id="aw3-9-h">Raise dispute</h2><div class="gate-body">
        <bx-raise-dispute [items]="[{label: 'Transaction', value: 'Coffee House · 4.50'}, {label: 'Reason', value: 'Charged twice'}]" />
      </div></section>
      <section class="gate" data-component="add-on-card" aria-labelledby="aw3-10-h"><h2 id="aw3-10-h">Add-on card</h2><div class="gate-body">
        <bx-add-on-card [items]="[{label: 'Name on the card', value: 'S. Rao'}, {label: 'Relationship', value: 'Spouse'}, {label: 'Limit (USD)', value: '2,000.00'}]" />
      </div></section>
      <section class="gate" data-component="card-statements" aria-labelledby="aw3-11-h"><h2 id="aw3-11-h">Card statements</h2><div class="gate-body">
        <bx-card-statements [items]="[{title: 'December statement', meta: 'Generated 01 Jan', value: 'PDF'}, {title: 'November statement', meta: 'Generated 01 Dec', value: 'PDF'}]" />
      </div></section>
      <section class="gate" data-component="otp" aria-labelledby="aw3-12-h"><h2 id="aw3-12-h">One-time code</h2><div class="gate-body">
        <bx-otp testID="ot1" [(value)]="code" helpText="We sent it to •••• 0123" />
        <bx-otp testID="ot2" value="123456" error="That code is not right. Check it, or send a new one." />
      </div></section>
      <section class="gate" data-component="session-timeout" aria-labelledby="aw3-13-h"><h2 id="aw3-13-h">Session timeout</h2><div class="gate-body">
        <bx-secondary-button label="Show the warning" (action)="timeoutOpen.set(true)" />
        <bx-session-timeout testID="st1" [(open)]="timeoutOpen" [seconds]="90" />
      </div></section>
      <section class="gate" data-component="secure-confirmation" aria-labelledby="aw3-14-h"><h2 id="aw3-14-h">Secure confirmation</h2><div class="gate-body">
        <bx-secure-confirmation [items]="[{label: 'Pay', value: 'A. Rao'}, {label: 'Amount', value: '1,250.00 USD'}, {label: 'Code sent to', value: '•••• 0123'}]" />
      </div></section>
      <section class="gate" data-component="sensitive" aria-labelledby="aw3-15-h"><h2 id="aw3-15-h">Sensitive field</h2><div class="gate-body">
        <bx-sensitive testID="sf1" value="4111 1111 1111 4821" />
      </div></section>
      <section class="gate" data-component="spending-chart" aria-labelledby="aw4-0-h"><h2 id="aw4-0-h">Spending chart</h2><div class="gate-body">
        <bx-spending-chart [items]="[{label: 'Aug', value: 1240}, {label: 'Sep', value: 980}, {label: 'Oct', value: 1410}, {label: 'Nov', value: 1640}, {label: 'Dec', value: 2120}]" unit="USD" />
      </div></section>
      <section class="gate" data-component="budget-progress" aria-labelledby="aw4-1-h"><h2 id="aw4-1-h">Budget progress</h2><div class="gate-body">
        <bx-budget-progress [items]="[{label: 'Groceries', value: 320, max: 400}, {label: 'Travel', value: 180, max: 300}, {label: 'Eating out', value: 210, max: 200}]" />
      </div></section>
      <section class="gate" data-component="spend-categories" aria-labelledby="aw4-2-h"><h2 id="aw4-2-h">Spend categories</h2><div class="gate-body">
        <bx-spend-categories [options]="['Eating out', 'Groceries', 'Travel', 'Shopping']" label="Coffee House · 4.50 is" [(value)]="cats" />
      </div></section>
      <section class="gate" data-component="approval-queue" aria-labelledby="aw4-3-h"><h2 id="aw4-3-h">Approval queue</h2><div class="gate-body">
        <bx-approval-queue [items]="[{title: 'Payroll Feb · prioritized', meta: 'Financial · 182,400.00', value: 'PAY-4410'}, {title: 'Vendor ABC Ltd', meta: 'Financial · 12,000.00', value: 'PAY-4412'}, {title: 'Add payee J. Mehta', meta: 'Non-financial', value: 'BEN-218'}]" />
      </div></section>
      <section class="gate" data-component="approval-detail" aria-labelledby="aw4-4-h"><h2 id="aw4-4-h">Approval detail</h2><div class="gate-body">
        <bx-approval-detail [items]="[{label: 'Reference', value: 'PAY-4410'}, {label: 'Initiated by', value: 'A. Rao, maker'}, {label: 'Amount', value: '182,400.00 USD'}, {label: 'Value date', value: '28 Jan'}, {label: 'Your level', value: '2 of 3'}]" />
      </div></section>
      <section class="gate" data-component="approval-journey" aria-labelledby="aw4-5-h"><h2 id="aw4-5-h">Approval journey</h2><div class="gate-body">
        <bx-approval-journey [items]="[{label: 'Initiated', meta: 'A. Rao · 09:12'}, {label: 'Approved, level 1', meta: 'P. Nair · 10:40'}, {label: 'Waiting, level 2', meta: 'Finance head', state: 'current'}, {label: 'Release', meta: 'Treasury', state: 'pending'}]" />
      </div></section>
      <section class="gate" data-component="reroute" aria-labelledby="aw4-6-h"><h2 id="aw4-6-h">Re-route</h2><div class="gate-body">
        <bx-reroute [options]="approvers" [(value)]="reroute" />
      </div></section>
      <section class="gate" data-component="modification-requested" aria-labelledby="aw4-7-h"><h2 id="aw4-7-h">Modification requested</h2><div class="gate-body">
        <bx-modification-requested message="PAY-4410 was sent back: change the value date to a working day." />
      </div></section>
      <section class="gate" data-component="pending-release" aria-labelledby="aw4-8-h"><h2 id="aw4-8-h">Pending release</h2><div class="gate-body">
        <bx-pending-release [items]="[{title: 'Payroll Jan', meta: 'Approved 3 of 3', value: '182,400.00'}, {title: 'Tax payment', meta: 'Approved 2 of 2', value: '9,800.00'}]" />
      </div></section>
      <section class="gate" data-component="structure-type" aria-labelledby="aw4-9-h"><h2 id="aw4-9-h">Structure type</h2><div class="gate-body">
        <bx-structure-type [(value)]="structure" />
      </div></section>
      <section class="gate" data-component="account-structure" aria-labelledby="aw4-10-h"><h2 id="aw4-10-h">Account structure</h2><div class="gate-body">
        <bx-account-structure [items]="[{id: 'h', title: 'Header account ·· 1000', body: 'Sweeps to zero balance daily at 18:00.'}, {id: 'p', title: 'Child: Payroll ·· 1010', body: 'Target balance 5,000.00.'}, {id: 'v', title: 'Child: Vendors ·· 1020', body: 'Sweeps above 2,000.00.'}]" />
      </div></section>
      <section class="gate" data-component="structure-simulation" aria-labelledby="aw4-11-h"><h2 id="aw4-11-h">Structure simulation</h2><div class="gate-body">
        <bx-structure-simulation [items]="[{label: 'Structure', value: 'Daily zero balance'}, {label: 'Accounts', value: '3'}, {label: 'Moved today', value: '182,400.00'}, {label: 'Interest benefit', value: '1,210.00 a month'}]" />
      </div></section>
      <section class="gate" data-component="intercompany-limits" aria-labelledby="aw4-12-h"><h2 id="aw4-12-h">Intercompany limits</h2><div class="gate-body">
        <bx-intercompany-limits [items]="[{label: 'Payroll Ltd', value: 120, max: 500}, {label: 'Vendors Ltd', value: 340, max: 400}]" unit="k" />
      </div></section>
      <section class="gate" data-component="sweep-monitor" aria-labelledby="aw4-13-h"><h2 id="aw4-13-h">Sweep monitor</h2><div class="gate-body">
        <bx-sweep-monitor [items]="[{label: 'Sweep started', meta: '18:00'}, {label: '3 of 3 accounts swept', meta: '18:02'}, {label: 'Interest reallocated', meta: '18:05', state: 'current'}]" />
      </div></section>
      <section class="gate" data-component="profile" aria-labelledby="aw4-14-h"><h2 id="aw4-14-h">Profile</h2><div class="gate-body">
        <bx-profile [items]="[{label: 'Name', value: 'A. Rao'}, {label: 'Email', value: 'a.rao@mail.example'}, {label: 'Mobile', value: '•••• 0123'}, {label: 'Address', value: '12 Bridge St, London'}]" />
      </div></section>
      <section class="gate" data-component="sign-in-options" aria-labelledby="aw4-15-h"><h2 id="aw4-15-h">Sign-in options</h2><div class="gate-body">
        <bx-sign-in-options [options]="['Passkey', 'Facial ID', 'Soft token']" [(value)]="signIn" />
      </div></section>
      <section class="gate" data-component="otp-delivery" aria-labelledby="aw4-16-h"><h2 id="aw4-16-h">Code delivery</h2><div class="gate-body">
        <bx-otp-delivery [(value)]="codesBy" />
      </div></section>
      <section class="gate" data-component="devices" aria-labelledby="aw4-17-h"><h2 id="aw4-17-h">Devices</h2><div class="gate-body">
        <bx-devices [items]="[{title: 'iPhone 15 · this device', meta: 'Registered 12 Mar', value: 'Active'}, {title: 'Chrome on Windows', meta: 'Last used today', value: 'Web'}]" />
      </div></section>
      <section class="gate" data-component="appearance" aria-labelledby="aw4-18-h"><h2 id="aw4-18-h">Appearance</h2><div class="gate-body">
        <bx-appearance [(value)]="theme" />
      </div></section>
      <section class="gate" data-component="language" aria-labelledby="aw4-19-h"><h2 id="aw4-19-h">Language</h2><div class="gate-body">
        <bx-language [options]="languages" [(value)]="lang" />
      </div></section>
      <section class="gate" data-component="alerts-subscription" aria-labelledby="aw4-20-h"><h2 id="aw4-20-h">Alert subscriptions</h2><div class="gate-body">
        <bx-alerts-subscription [options]="['Payments over 500.00', 'Low balance', 'Sign-in from a new device']" [(value)]="alerts" />
      </div></section>
      <section class="gate" data-component="do-not-disturb" aria-labelledby="aw4-21-h"><h2 id="aw4-21-h">Do not disturb</h2><div class="gate-body">
        <bx-do-not-disturb [(value)]="quiet" />
      </div></section>
      <section class="gate" data-component="consents" aria-labelledby="aw4-22-h"><h2 id="aw4-22-h">Consents</h2><div class="gate-body">
        <bx-consents [items]="[{title: 'Budget app (open banking)', meta: 'Granted 02 Jan · ends 02 Apr', value: 'Accounts'}, {title: 'Tax filing service', meta: 'Granted 10 Dec · ends 10 Mar', value: 'Statements'}]" />
      </div></section>
      <section class="gate" data-component="transaction-limits" aria-labelledby="aw4-23-h"><h2 id="aw4-23-h">Transaction limits</h2><div class="gate-body">
        <bx-transaction-limits [items]="[{label: 'Daily transfers', value: 1200, max: 5000}, {label: 'Bill payments', value: 300, max: 2000}]" />
      </div></section>
      <section class="gate" data-component="session-summary" aria-labelledby="aw4-24-h"><h2 id="aw4-24-h">Session summary</h2><div class="gate-body">
        <bx-session-summary [items]="[{label: 'Today 08:12', meta: 'iPhone 15 · London'}, {label: 'Yesterday 19:40', meta: 'Chrome on Windows · London'}, {label: '3 Jan 07:55', meta: 'iPhone 15 · Paris'}]" />
      </div></section>
      <section class="gate" data-component="raise-request" aria-labelledby="aw5-0-h"><h2 id="aw5-0-h">Raise request</h2><div class="gate-body">
        <bx-raise-request [items]="[{label: 'Request', value: 'Cheque book'}, {label: 'Account', value: 'Savings ·· 4821'}, {label: 'Leaves', value: '25'}]" />
      </div></section>
      <section class="gate" data-component="track-requests" aria-labelledby="aw5-1-h"><h2 id="aw5-1-h">Track requests</h2><div class="gate-body">
        <bx-track-requests [items]="[{label: 'Received', meta: 'SR-2210 · 10 Jan'}, {label: 'In progress', meta: 'Printing the cheque book', state: 'current'}, {label: 'Dispatched', meta: 'Expected 15 Jan', state: 'pending'}]" />
      </div></section>
      <section class="gate" data-component="mailbox" aria-labelledby="aw5-2-h"><h2 id="aw5-2-h">Mailbox</h2><div class="gate-body">
        <bx-mailbox [items]="[{title: 'Your cheque book is on the way', meta: 'Today', value: 'Mail', unread: true}, {title: 'Low balance on Current ·· 7730', meta: 'Yesterday', value: 'Alert'}, {title: 'New statement ready', meta: '2 days ago', value: 'Notice'}]" />
      </div></section>
      <section class="gate" data-component="compose-mail" aria-labelledby="aw5-3-h"><h2 id="aw5-3-h">Compose message</h2><div class="gate-body">
        <bx-compose-mail [(value)]="message" />
      </div></section>
      <section class="gate" data-component="e-receipts" aria-labelledby="aw5-4-h"><h2 id="aw5-4-h">E-receipts</h2><div class="gate-body">
        <bx-e-receipts [items]="[{title: 'Transfer to A. Rao', meta: '14 Jan · 1,250.00', value: 'PDF'}, {title: 'Electricity bill', meta: '10 Jan · 86.20', value: 'PDF'}]" />
      </div></section>
      <section class="gate" data-component="certificates" aria-labelledby="aw5-5-h"><h2 id="aw5-5-h">Certificates</h2><div class="gate-body">
        <bx-certificates [items]="[{title: 'Interest certificate', meta: 'Savings ·· 4821 · 2025', value: 'PDF'}, {title: 'Balance certificate', meta: 'As of 31 Dec', value: 'PDF'}, {title: 'TDS certificate', meta: 'FY 2025', value: 'PDF'}]" />
      </div></section>
      <section class="gate" data-component="statement-request" aria-labelledby="aw5-6-h"><h2 id="aw5-6-h">Statement request</h2><div class="gate-body">
        <bx-statement-request [(value)]="period" [maxDays]="92" />
      </div></section>
      <section class="gate" data-component="statement-format" aria-labelledby="aw5-7-h"><h2 id="aw5-7-h">Statement format</h2><div class="gate-body">
        <bx-statement-format [(value)]="format" />
      </div></section>
      <section class="gate" data-component="self-register" aria-labelledby="aw5-8-h"><h2 id="aw5-8-h">Self registration</h2><div class="gate-body">
        <bx-self-register selectedStep="Verify" />
      </div></section>
      <section class="gate" data-component="fatca-crs" aria-labelledby="aw5-9-h"><h2 id="aw5-9-h">FATCA and CRS</h2><div class="gate-body">
        <bx-fatca-crs selectedStep="Tax residency" />
      </div></section>
      <section class="gate" data-component="product-showcase" aria-labelledby="aw5-10-h"><h2 id="aw5-10-h">Product showcase</h2><div class="gate-body">
        <bx-product-showcase heading="Platinum credit card" text="2% cashback · no annual fee in year one" badge="New" actionLabel="Apply now →" />
      </div></section>
      <section class="gate" data-component="application-tracker" aria-labelledby="aw5-11-h"><h2 id="aw5-11-h">Application tracker</h2><div class="gate-body">
        <bx-application-tracker [items]="[{label: 'Submitted', meta: '12 Jan'}, {label: 'Documents checked', meta: '13 Jan'}, {label: 'Credit decision', meta: 'Expected 16 Jan', state: 'current'}, {label: 'Card sent', meta: '—', state: 'pending'}]" />
      </div></section>
      <section class="gate" data-component="terms-consent" aria-labelledby="aw5-12-h"><h2 id="aw5-12-h">Terms consent</h2><div class="gate-body">
        <bx-terms-consent [options]="['I accept the terms and conditions', 'Send me offers by email']" [(value)]="terms" />
      </div></section>
      <section class="gate" data-component="eligibility-calculator" aria-labelledby="aw5-13-h"><h2 id="aw5-13-h">Eligibility calculator</h2><div class="gate-body">
        <bx-eligibility-calculator [(value)]="income" prefix="USD" helpText="You could borrow up to 60,000.00" />
      </div></section>
      <section class="gate" data-component="td-calculator" aria-labelledby="aw5-14-h"><h2 id="aw5-14-h">Deposit calculator</h2><div class="gate-body">
        <bx-td-calculator currency="USD" />
      </div></section>
      <section class="gate" data-component="goal-calculator" aria-labelledby="aw5-15-h"><h2 id="aw5-15-h">Goal calculator</h2><div class="gate-body">
        <bx-goal-calculator [(value)]="saving" prefix="USD" helpText="You reach 3,000.00 in 8 months" />
      </div></section>
      <section class="gate" data-component="locator" aria-labelledby="aw5-16-h"><h2 id="aw5-16-h">Locator</h2><div class="gate-body">
        <bx-locator [items]="places" />
      </div></section>
      <section class="gate" data-component="live-chat" aria-labelledby="aw5-17-h"><h2 id="aw5-17-h">Live chat</h2><div class="gate-body">
        <bx-live-chat [messages]="chat" [typing]="true" />
      </div></section>
      <section class="gate" data-component="feedback" aria-labelledby="aw5-18-h"><h2 id="aw5-18-h">Feedback rating</h2><div class="gate-body">
        <bx-feedback label="How was this payment?" [(value)]="stars" />
      </div></section>
      <section class="gate" data-component="nominations" aria-labelledby="aw5-19-h"><h2 id="aw5-19-h">Nominations</h2><div class="gate-body">
        <bx-nominations [items]="[{title: 'S. Rao · spouse', meta: 'Savings ·· 4821', value: '50%'}, {title: 'K. Rao · son', meta: 'Savings ·· 4821', value: '50%'}]" />
      </div></section>
      <section class="gate" data-component="faq" aria-labelledby="aw5-20-h"><h2 id="aw5-20-h">FAQ</h2><div class="gate-body">
        <bx-faq [items]="faq" />
      </div></section>
      <section class="gate" data-component="card-tile" aria-labelledby="ap-card-tile-h"><h2 id="ap-card-tile-h">Card tile</h2><div class="gate-body">
        <bx-card-tile testID="ct1" label="Platinum" number="4111111111114821" holder="A. RAO" expiry="09/29" network="Visa" />
        <bx-card-tile testID="ct2" label="Classic" number="4111111111117710" network="Visa" [frozen]="true" />
      </div></section>
      <section class="gate" data-component="activate-card" aria-labelledby="ap-activate-card-h"><h2 id="ap-activate-card-h">Activate card</h2><div class="gate-body">
        <bx-activate-card testID="ak1" />
      </div></section>
      <section class="gate" data-component="spend-limit" aria-labelledby="ap-spend-limit-h"><h2 id="ap-spend-limit-h">Card limits</h2><div class="gate-body">
        <bx-spend-limit testID="sl1" [value]="2000" prefix="USD" />
      </div></section>
      <section class="gate" data-component="card-controls" aria-labelledby="ap-card-controls-h"><h2 id="ap-card-controls-h">Card controls</h2><div class="gate-body">
        <bx-card-controls testID="cc1" [options]="['Online payments', 'ATM withdrawals', 'Use abroad']" [value]="['Online payments']" />
      </div></section>
      <section class="gate" data-component="reset-pin" aria-labelledby="ap-reset-pin-h"><h2 id="ap-reset-pin-h">Reset PIN</h2><div class="gate-body">
        <bx-reset-pin testID="pn1" />
      </div></section>
      <section class="gate" data-component="biometric" aria-labelledby="ap-biometric-h"><h2 id="ap-biometric-h">Biometric</h2><div class="gate-body">
        <bx-biometric testID="bm1" text="Touch the sensor to approve 1,250.00 to A. Rao." />
        <bx-biometric testID="bm2" method="face" actionLabel="Use Face ID" state="failed" />
      </div></section>
      <section class="gate" data-component="kyc-steps" aria-labelledby="ap-kyc-steps-h"><h2 id="ap-kyc-steps-h">KYC steps</h2><div class="gate-body">
        <bx-kyc-steps testID="ky1" selectedStep="Selfie" />
      </div></section>
      <section class="gate" data-component="fraud-alert" aria-labelledby="ap-fraud-alert-h"><h2 id="ap-fraud-alert-h">Fraud alert</h2><div class="gate-body">
        <bx-fraud-alert testID="fa1" message="We stopped a payment of 899.00 to Unknown Ltd." />
      </div></section>
      <section class="gate" data-component="savings-goal" aria-labelledby="ap-savings-goal-h"><h2 id="ap-savings-goal-h">Savings goal</h2><div class="gate-body">
        <bx-savings-goal [items]="[{ label: 'Holiday fund', value: 1800, max: 3000 }]" unit="USD" />
      </div></section>
      <section class="gate" data-component="loan-calculator" aria-labelledby="ap-loan-calculator-h"><h2 id="ap-loan-calculator-h">Loan calculator</h2><div class="gate-body">
        <bx-loan-calculator currency="USD" actionLabel="Apply for this loan" />
      </div></section>
      <section class="gate" data-component="currency-converter" aria-labelledby="ap-currency-converter-h"><h2 id="ap-currency-converter-h">Currency converter</h2><div class="gate-body">
        <bx-currency-converter currency="USD" toCurrency="EUR" [rate]="0.92" />
      </div></section>
      <section class="gate" data-component="financial-overview" aria-labelledby="aw6-0-h"><h2 id="aw6-0-h">Financial overview</h2><div class="gate-body">
        <bx-financial-overview [items]="[{label: 'Assets', value: '4.2M', meta: 'CASA, deposits'}, {label: 'Liabilities', value: '1.1M', meta: 'Loans'}, {label: 'Net worth', value: '3.1M', meta: 'Assets less liabilities'}]" />
      </div></section>
      <section class="gate" data-component="position-by-currency" aria-labelledby="aw6-1-h"><h2 id="aw6-1-h">Position by currency</h2><div class="gate-body">
        <bx-position-by-currency [items]="[{label: 'USD', value: 88}, {label: 'EUR', value: 60}, {label: 'GBP', value: 42}, {label: 'INR', value: 30}, {label: 'AED', value: 18}]" note="In millions, assets" />
      </div></section>
      <section class="gate" data-component="credit-line-usage" aria-labelledby="aw6-2-h"><h2 id="aw6-2-h">Credit line usage</h2><div class="gate-body">
        <bx-credit-line-usage [items]="[{label: 'Working capital', value: 720, max: 1000}, {label: 'Import LC line', value: 300, max: 500}, {label: 'Guarantees', value: 90, max: 400}]" unit="k" />
      </div></section>
      <section class="gate" data-component="bills-receivable-payable" aria-labelledby="aw6-3-h"><h2 id="aw6-3-h">Bills receivable and payable</h2><div class="gate-body">
        <bx-bills-receivable-payable [items]="[{label: 'Receivable', value: '1.8M', meta: 'Export bills'}, {label: 'Payable', value: '0.9M', meta: 'Import bills'}]" />
      </div></section>
      <section class="gate" data-component="trade-instruments" aria-labelledby="aw6-4-h"><h2 id="aw6-4-h">Trade instruments</h2><div class="gate-body">
        <bx-trade-instruments [items]="[{title: 'LC ILC2201', meta: 'Expires in 9 days', value: '250,000.00'}, {title: 'Guarantee OG118', meta: 'Expires in 14 days', value: '80,000.00'}]" />
      </div></section>
      <section class="gate" data-component="reports" aria-labelledby="aw6-5-h"><h2 id="aw6-5-h">Reports</h2><div class="gate-body">
        <bx-reports [items]="[{title: 'Account statement · Dec', meta: 'Generated today', value: 'PDF'}, {title: 'Payments summary', meta: 'Yesterday', value: 'CSV'}]" />
      </div></section>
      <section class="gate" data-component="accounts-corp" aria-labelledby="aw6-6-h"><h2 id="aw6-6-h">Accounts (corporate)</h2><div class="gate-body">
        <bx-accounts-corp [items]="[{id: 'casa', label: 'Current and savings', summary: '12 accounts · 3.4M'}, {id: 'td', label: 'Term deposits', summary: '4 deposits · 1.2M'}, {id: 'loans', label: 'Loans and finances', summary: '2 loans · 1.1M outstanding'}]" />
      </div></section>
      <section class="gate" data-component="corporate-limits" aria-labelledby="aw6-7-h"><h2 id="aw6-7-h">Corporate limits</h2><div class="gate-body">
        <bx-corporate-limits [items]="[{label: 'Daily, own transfers', value: 420, max: 1000}, {label: 'Monthly, payments', value: 6200, max: 20000}]" unit="k" />
      </div></section>
      <section class="gate" data-component="transactions-widget" aria-labelledby="aw6-8-h"><h2 id="aw6-8-h">Transactions (corporate)</h2><div class="gate-body">
        <bx-transactions-widget [items]="[{id: 'pending', label: 'Pending', summary: '6 waiting: 4 financial, 2 non-financial'}, {id: 'initiated', label: 'Initiated', summary: '3 initiated today'}, {id: 'log', label: 'Log', summary: '42 this week'}, {id: 'approved', label: 'Approved', summary: '18 approved today'}]" />
      </div></section>
      <section class="gate" data-component="last-5-payments" aria-labelledby="aw6-9-h"><h2 id="aw6-9-h">Last 5 payments</h2><div class="gate-body">
        <bx-last-5-payments [items]="[{title: 'Payroll Jan', meta: 'Processed', value: '182,400.00', tone: 'success'}, {title: 'Vendor ABC Ltd', meta: 'In progress', value: '12,000.00'}, {title: 'Tax', meta: 'Rejected', value: '9,800.00', tone: 'danger'}]" />
      </div></section>
      <section class="gate" data-component="bulk-file-upload" aria-labelledby="aw6-10-h"><h2 id="aw6-10-h">Bulk file upload</h2><div class="gate-body">
        <bx-bulk-file-upload [(value)]="bulk" />
      </div></section>
      <section class="gate" data-component="quick-links-corp" aria-labelledby="aw6-11-h"><h2 id="aw6-11-h">Quick links (corporate)</h2><div class="gate-body">
        <bx-quick-links-corp [items]="[{id: 'own', label: 'Own account', icon: '⇄'}, {id: 'transfer', label: 'Transfer', icon: '↗'}, {id: 'adhoc', label: 'Ad-hoc', icon: '+'}, {id: 'file', label: 'File upload', icon: '⇪'}]" />
      </div></section>
      <section class="gate" data-component="work-snapshot" aria-labelledby="aw6-12-h"><h2 id="aw6-12-h">Work snapshot</h2><div class="gate-body">
        <bx-work-snapshot [items]="[{label: 'Processed', value: '12', meta: 'Approved today'}, {label: 'In progress', value: '4', meta: 'Initiated today'}, {label: 'Rejected', value: '1', meta: 'Needs a fix'}]" />
      </div></section>
      <section class="gate" data-component="notifications-widget" aria-labelledby="aw6-13-h"><h2 id="aw6-13-h">Notifications (corporate)</h2><div class="gate-body">
        <bx-notifications-widget [items]="[{title: 'USD cut-off moves to 3 pm', meta: 'Today', value: 'Bank'}, {title: 'New tax form available', meta: '2 days ago', value: 'Bank'}]" />
      </div></section>
      <section class="gate" data-component="pending-for-action" aria-labelledby="aw6-14-h"><h2 id="aw6-14-h">Pending for action</h2><div class="gate-body">
        <bx-pending-for-action [items]="[{label: 'Payments', value: 70}, {label: 'Trade', value: 35}, {label: 'Accounts', value: 20}, {label: 'Limits', value: 10}]" unit="pending" />
      </div></section>
      <section class="gate" data-component="my-limits" aria-labelledby="aw6-15-h"><h2 id="aw6-15-h">My limits</h2><div class="gate-body">
        <bx-my-limits [items]="[{label: 'Initiate, per transaction', value: 50, max: 100}, {label: 'Approve, daily', value: 240, max: 500}]" unit="k" />
      </div></section>
      <section class="gate" data-component="pending-approvals" aria-labelledby="aw6-16-h"><h2 id="aw6-16-h">Pending approvals</h2><div class="gate-body">
        <bx-pending-approvals [items]="[{title: 'Payroll Feb · prioritized', meta: 'Financial · 182,400.00', value: 'PAY-4410'}, {title: 'Add payee J. Mehta', meta: 'Non-financial', value: 'BEN-218'}]" />
      </div></section>
      <section class="gate" data-component="overview" aria-labelledby="ap-overview-h"><h2 id="ap-overview-h">Overview</h2><div class="gate-body">
        <bx-overview [items]="[{ label: 'Current and savings', value: '15,610.50', meta: '3 accounts' }, { label: 'Term deposits', value: '25,000.00', meta: '2 deposits' }, { label: 'Loans', value: '18,420.00', meta: '1 loan outstanding' }, { label: 'Credit cards', value: '640.00 due', meta: '2 cards' }, { label: 'Mutual funds', value: '4,120.00', meta: '1 fund' }]" />
      </div></section>
      <section class="gate" data-component="quick-insights" aria-labelledby="ap-quick-insights-h"><h2 id="ap-quick-insights-h">Quick insights</h2><div class="gate-body">
        <bx-quick-insights [items]="[{ title: 'Term deposit matures', meta: 'In 5 days · ·· 9011', value: '25,000.00' }, { title: 'Card payment due', meta: '18 Jan · ·· 4821', value: '640.00' }, { title: 'Low balance', meta: 'Current ·· 7730', value: '210.00' }]" />
      </div></section>
      <section class="gate" data-component="recent-transactions" aria-labelledby="ap-recent-transactions-h"><h2 id="ap-recent-transactions-h">Recent transactions</h2><div class="gate-body">
        <bx-recent-transactions currency="USD" [items]="txns" />
      </div></section>
      <section class="gate" data-component="bills-widget" aria-labelledby="ap-bills-widget-h"><h2 id="ap-bills-widget-h">Bills</h2><div class="gate-body">
        <bx-bills-widget [items]="[{ title: 'Electricity', meta: 'Due 20 Jan', value: '86.20' }, { title: 'Water', meta: 'Due 25 Jan', value: '24.10' }]" />
      </div></section>
      <section class="gate" data-component="spend-analysis" aria-labelledby="ap-spend-analysis-h"><h2 id="ap-spend-analysis-h">Spend analysis</h2><div class="gate-body">
        <bx-spend-analysis [items]="[{ label: 'Groceries', value: 320 }, { label: 'Travel', value: 180 }, { label: 'Eating out', value: 210 }, { label: 'Shopping', value: 140 }]" unit="USD" />
      </div></section>
      <section class="gate" data-component="goals" aria-labelledby="ap-goals-h"><h2 id="ap-goals-h">Goals</h2><div class="gate-body">
        <bx-goals [items]="[{ label: 'Holiday fund', value: 1800, max: 3000 }, { label: 'New car', value: 4200, max: 15000 }]" />
      </div></section>
      <section class="gate" data-component="budgets" aria-labelledby="ap-budgets-h"><h2 id="ap-budgets-h">Budgets</h2><div class="gate-body">
        <bx-budgets [items]="[{ label: 'Groceries', value: 320, max: 400 }, { label: 'Travel', value: 180, max: 300 }, { label: 'Eating out', value: 210, max: 200 }]" />
      </div></section>
      <section class="gate" data-component="calculators" aria-labelledby="ap-calculators-h"><h2 id="ap-calculators-h">Calculators</h2><div class="gate-body">
        <bx-calculators currency="USD" />
      </div></section>
      <section class="gate" data-component="credit-score" aria-labelledby="ap-credit-score-h"><h2 id="ap-credit-score-h">Credit score</h2><div class="gate-body">
        <bx-credit-score [items]="[{ label: 'Credit score', value: 742, max: 900 }]" />
      </div></section>
      <section class="gate" data-component="rewards" aria-labelledby="ap-rewards-h"><h2 id="ap-rewards-h">Rewards</h2><div class="gate-body">
        <bx-rewards [items]="[{ label: 'Points', value: '12,400', meta: 'Redeem for merchandise, vouchers or air miles' }, { label: 'Vouchers', value: '3', meta: 'Expire 31 Mar' }, { label: 'Cashback', value: '45.00', meta: 'Paid on the 1st' }]" />
      </div></section>
      <section class="gate" data-component="financial-advisor" aria-labelledby="ap-financial-advisor-h"><h2 id="ap-financial-advisor-h">Financial advisor</h2><div class="gate-body">
        <bx-financial-advisor heading="Priya Nair" text="priya.nair@bank.example · +44 20 7946 0123" badge="Relationship manager" />
      </div></section>
      <section class="gate" data-component="special-offers" aria-labelledby="ap-special-offers-h"><h2 id="ap-special-offers-h">Special offers</h2><div class="gate-body">
        <bx-special-offers heading="Pre-approved personal loan" text="Up to 25,000.00 at 9.5% a year." badge="Offer" />
      </div></section>
      <section class="gate" data-component="credit-cards-overview" aria-labelledby="ap-credit-cards-overview-h"><h2 id="ap-credit-cards-overview-h">Credit cards</h2><div class="gate-body">
        <bx-credit-cards-overview [items]="[{ label: 'Total due', value: '640.00', meta: 'Due 18 Jan' }, { label: 'Minimum due', value: '32.00', meta: 'Pay to avoid charges' }, { label: 'Available limit', value: '9,360.00', meta: 'Of 10,000.00' }]" />
      </div></section>
      <section class="gate" data-component="loans-overview" aria-labelledby="ap-loans-overview-h"><h2 id="ap-loans-overview-h">Loans</h2><div class="gate-body">
        <bx-loans-overview [items]="[{ label: 'Loans', value: '2', meta: 'Home and car' }, { label: 'Outstanding', value: '18,420.00', meta: 'Next instalment 5 Feb' }, { label: 'Sanctioned', value: '30,000.00', meta: 'Both loans' }]" />
      </div></section>
      <section class="gate" data-component="delinquency-notice" aria-labelledby="ap-delinquency-notice-h"><h2 id="ap-delinquency-notice-h">Delinquency notice</h2><div class="gate-body">
        <bx-delinquency-notice message="Your car loan ·· 3310 is 12 days overdue: 412.00." />
      </div></section>
      <section class="gate" data-component="rolling-digits" aria-labelledby="aw7-0-h"><h2 id="aw7-0-h">Rolling digits</h2><div class="gate-body">
        <bx-rolling-digits [value]="12400.5" currency="USD" /><div data-variant="smooth"><bx-rolling-digits variant="smooth" [value]="12400.5" currency="USD" /></div><div data-variant="quick"><bx-rolling-digits variant="quick" [value]="12400.5" currency="USD" /></div><div data-variant="slow"><bx-rolling-digits variant="slow" [value]="12400.5" currency="USD" /></div>
      </div></section>
      <section class="gate" data-component="count-up" aria-labelledby="aw7-1-h"><h2 id="aw7-1-h">Count up</h2><div class="gate-body">
        <bx-count-up [value]="1840.2" currency="USD" /><div data-variant="quick"><bx-count-up variant="quick" [value]="1840.2" currency="USD" /></div><div data-variant="slow"><bx-count-up variant="slow" [value]="1840.2" currency="USD" /></div><div data-variant="steady"><bx-count-up variant="steady" [value]="1840.2" currency="USD" /></div>
      </div></section>
      <section class="gate" data-component="split-flap-board" aria-labelledby="aw7-2-h"><h2 id="aw7-2-h">Split-flap board</h2><div class="gate-body">
        <bx-split-flap-board [items]="[{label: 'USD', value: '0.92 EUR'}, {label: 'GBP', value: '1.17 EUR'}]" />
      </div></section>
      <section class="gate" data-component="reveal-digits" aria-labelledby="aw7-3-h"><h2 id="aw7-3-h">Reveal digits</h2><div class="gate-body">
        <bx-reveal-digits value="GB29 NWBK 6016 1331 9268 19" />
      </div></section>
      <section class="gate" data-component="blur-in-text" aria-labelledby="aw7-4-h"><h2 id="aw7-4-h">Blur-in text</h2><div class="gate-body">
        <bx-blur-in-text text="Your money, clearly." /><div data-variant="gentle"><bx-blur-in-text variant="gentle" text="Your money, clearly." /></div><div data-variant="crisp"><bx-blur-in-text variant="crisp" text="Your money, clearly." /></div><div data-variant="dramatic"><bx-blur-in-text variant="dramatic" text="Your money, clearly." /></div>
      </div></section>
      <section class="gate" data-component="text-reveal" aria-labelledby="aw7-5-h"><h2 id="aw7-5-h">Text reveal</h2><div class="gate-body">
        <bx-text-reveal text="Welcome back, Asha" /><div data-variant="from-end"><bx-text-reveal variant="from-end" text="Welcome back, Asha" /></div><div data-variant="rise"><bx-text-reveal variant="rise" text="Welcome back, Asha" /></div><div data-variant="quick"><bx-text-reveal variant="quick" text="Welcome back, Asha" /></div>
      </div></section>
      <section class="gate" data-component="rotating-text" aria-labelledby="aw7-6-h"><h2 id="aw7-6-h">Rotating text</h2><div class="gate-body">
        <bx-rotating-text prefix="Pay" [words]="['bills', 'friends', 'cards']" /><div data-variant="fade"><bx-rotating-text variant="fade" prefix="Pay" [words]="['bills', 'friends', 'cards']" /></div><div data-variant="flip"><bx-rotating-text variant="flip" prefix="Pay" [words]="['bills', 'friends', 'cards']" /></div><div data-variant="brisk"><bx-rotating-text variant="brisk" prefix="Pay" [words]="['bills', 'friends', 'cards']" /></div>
      </div></section>
      <section class="gate" data-component="shimmer-text" aria-labelledby="aw7-7-h"><h2 id="aw7-7-h">Shimmer text</h2><div class="gate-body">
        <bx-shimmer-text text="New: instant transfers" /><div data-variant="slow"><bx-shimmer-text variant="slow" text="New: instant transfers" /></div><div data-variant="ocean"><bx-shimmer-text variant="ocean" text="New: instant transfers" /></div><div data-variant="gold"><bx-shimmer-text variant="gold" text="New: instant transfers" /></div>
      </div></section>
      <section class="gate" data-component="gradient-text" aria-labelledby="aw7-8-h"><h2 id="aw7-8-h">Gradient text</h2><div class="gate-body">
        <bx-gradient-text text="Platinum" /><div data-variant="ocean"><bx-gradient-text variant="ocean" text="Platinum" /></div><div data-variant="sunset"><bx-gradient-text variant="sunset" text="Platinum" /></div><div data-variant="graphite"><bx-gradient-text variant="graphite" text="Platinum" /></div>
      </div></section>
      <section class="gate" data-component="typed-text" aria-labelledby="aw7-9-h"><h2 id="aw7-9-h">Typed text</h2><div class="gate-body">
        <bx-typed-text text="You spent 320.00 on groceries this month, 40.00 less than last month." /><div data-variant="quick"><bx-typed-text variant="quick" text="You spent 320.00 on groceries this month, 40.00 less than last month." /></div><div data-variant="deliberate"><bx-typed-text variant="deliberate" text="You spent 320.00 on groceries this month, 40.00 less than last month." /></div>
      </div></section>
      <section class="gate" data-component="focus-word" aria-labelledby="aw7-10-h"><h2 id="aw7-10-h">Focus word</h2><div class="gate-body">
        <bx-focus-word text="Save a little every day" /><div data-variant="slow"><bx-focus-word variant="slow" text="Save a little every day" /></div><div data-variant="soft"><bx-focus-word variant="soft" text="Save a little every day" /></div><div data-variant="sharp"><bx-focus-word variant="sharp" text="Save a little every day" /></div>
      </div></section>
      <section class="gate" data-component="scroll-float-text" aria-labelledby="aw7-11-h"><h2 id="aw7-11-h">Scroll float text</h2><div class="gate-body">
        <bx-scroll-float-text text="Grow your savings" /><div data-variant="sink"><bx-scroll-float-text variant="sink" text="Grow your savings" /></div><div data-variant="gentle"><bx-scroll-float-text variant="gentle" text="Grow your savings" /></div><div data-variant="bold"><bx-scroll-float-text variant="bold" text="Grow your savings" /></div>
      </div></section>
      <section class="gate" data-component="fade-in-content" aria-labelledby="aw7-12-h"><h2 id="aw7-12-h">Fade-in content</h2><div class="gate-body">
        <bx-fade-in-content effect="fadeup"><p>The screen's own content</p></bx-fade-in-content><div data-variant="scale"><bx-fade-in-content variant="scale"><p>The screen's own content</p></bx-fade-in-content></div><div data-variant="slide"><bx-fade-in-content variant="slide"><p>The screen's own content</p></bx-fade-in-content></div><div data-variant="blur"><bx-fade-in-content variant="blur"><p>The screen's own content</p></bx-fade-in-content></div>
      </div></section>
      <section class="gate" data-component="scroll-reveal" aria-labelledby="aw7-13-h"><h2 id="aw7-13-h">Scroll reveal</h2><div class="gate-body">
        <bx-scroll-reveal effect="scale"><p>The screen's own content</p></bx-scroll-reveal><div data-variant="scale"><bx-scroll-reveal variant="scale"><p>The screen's own content</p></bx-scroll-reveal></div><div data-variant="slide"><bx-scroll-reveal variant="slide"><p>The screen's own content</p></bx-scroll-reveal></div><div data-variant="blur"><bx-scroll-reveal variant="blur"><p>The screen's own content</p></bx-scroll-reveal></div>
      </div></section>
      <section class="gate" data-component="scroll-expand" aria-labelledby="aw7-14-h"><h2 id="aw7-14-h">Scroll expand</h2><div class="gate-body">
        <bx-scroll-expand><p>The screen's own content</p></bx-scroll-expand><div data-variant="subtle"><bx-scroll-expand variant="subtle"><p>The screen's own content</p></bx-scroll-expand></div><div data-variant="bold"><bx-scroll-expand variant="bold"><p>The screen's own content</p></bx-scroll-expand></div>
      </div></section>
      <section class="gate" data-component="edge-blur" aria-labelledby="aw7-15-h"><h2 id="aw7-15-h">Edge blur</h2><div class="gate-body">
        <bx-edge-blur><p>The screen's own content</p></bx-edge-blur><div data-variant="soft"><bx-edge-blur variant="soft"><p>The screen's own content</p></bx-edge-blur></div><div data-variant="tight"><bx-edge-blur variant="tight"><p>The screen's own content</p></bx-edge-blur></div>
      </div></section>
      <section class="gate" data-component="glare-hover" aria-labelledby="aw7-16-h"><h2 id="aw7-16-h">Glare hover</h2><div class="gate-body">
        <bx-glare-hover><p>The screen's own content</p></bx-glare-hover><div data-variant="subtle"><bx-glare-hover variant="subtle"><p>The screen's own content</p></bx-glare-hover></div><div data-variant="bright"><bx-glare-hover variant="bright"><p>The screen's own content</p></bx-glare-hover></div>
      </div></section>
      <section class="gate" data-component="magnetic-button" aria-labelledby="aw7-17-h"><h2 id="aw7-17-h">Magnetic button</h2><div class="gate-body">
        <bx-magnetic-button label="Open an account" />
      </div></section>
      <section class="gate" data-component="highlight-border" aria-labelledby="aw7-18-h"><h2 id="aw7-18-h">Highlight border</h2><div class="gate-body">
        <bx-highlight-border><p>The screen's own content</p></bx-highlight-border><div data-variant="ocean"><bx-highlight-border variant="ocean"><p>The screen's own content</p></bx-highlight-border></div><div data-variant="sunset"><bx-highlight-border variant="sunset"><p>The screen's own content</p></bx-highlight-border></div><div data-variant="graphite"><bx-highlight-border variant="graphite"><p>The screen's own content</p></bx-highlight-border></div>
      </div></section>
      <section class="gate" data-component="click-burst" aria-labelledby="aw7-19-h"><h2 id="aw7-19-h">Click burst</h2><div class="gate-body">
        <bx-click-burst><p>The screen's own content</p></bx-click-burst><div data-variant="confetti"><bx-click-burst variant="confetti"><p>The screen's own content</p></bx-click-burst></div><div data-variant="quiet"><bx-click-burst variant="quiet"><p>The screen's own content</p></bx-click-burst></div>
      </div></section>
      <section class="gate" data-component="marquee" aria-labelledby="aw7-20-h"><h2 id="aw7-20-h">Marquee</h2><div class="gate-body">
        <bx-marquee [items]="['USD 0.92 EUR', 'GBP 1.17 EUR', 'AED 0.25 EUR']" /><div data-variant="slow"><bx-marquee variant="slow" [items]="['USD 0.92 EUR', 'GBP 1.17 EUR', 'AED 0.25 EUR']" /></div><div data-variant="fast"><bx-marquee variant="fast" [items]="['USD 0.92 EUR', 'GBP 1.17 EUR', 'AED 0.25 EUR']" /></div><div data-variant="reverse"><bx-marquee variant="reverse" [items]="['USD 0.92 EUR', 'GBP 1.17 EUR', 'AED 0.25 EUR']" /></div>
      </div></section>
      <section class="gate" data-component="animated-list" aria-labelledby="aw7-21-h"><h2 id="aw7-21-h">Animated list</h2><div class="gate-body">
        <bx-animated-list label="Recent" [items]="['Coffee House', {title: 'Salary', meta: '31 Dec'}]" />
      </div></section>
      <section class="gate" data-component="spotlight-card" aria-labelledby="aw7-22-h"><h2 id="aw7-22-h">Spotlight card</h2><div class="gate-body">
        <bx-spotlight-card heading="Platinum card" text="2% cashback on travel" />
      </div></section>
      <section class="gate" data-component="tilt-card" aria-labelledby="aw7-23-h"><h2 id="aw7-23-h">Tilt card</h2><div class="gate-body">
        <bx-tilt-card heading="Savings" text="12,400.00" />
      </div></section>
      <section class="gate" data-component="flip-card" aria-labelledby="aw7-24-h"><h2 id="aw7-24-h">Flip card</h2><div class="gate-body">
        <bx-flip-card heading="Platinum" front="2% cashback" back="No annual fee in year one; 1.5% on foreign spend." />
      </div></section>
      <section class="gate" data-component="card-stack" aria-labelledby="aw7-25-h"><h2 id="aw7-25-h">Card stack</h2><div class="gate-body">
        <bx-card-stack [items]="[{title: 'Set a budget', text: 'See where your money goes'}, {title: 'Turn on alerts', text: 'Know when a payment leaves'}]" />
      </div></section>
      <section class="gate" data-component="glow-border-card" aria-labelledby="aw7-26-h"><h2 id="aw7-26-h">Glow border card</h2><div class="gate-body">
        <bx-glow-border-card heading="Premium account" />
      </div></section>
      <section class="gate" data-component="bento-grid" aria-labelledby="aw7-27-h"><h2 id="aw7-27-h">Bento grid</h2><div class="gate-body">
        <bx-bento-grid label="Dashboard" [items]="[{id: 'spend', title: 'Spending', figure: '1,240.00', size: 'wide'}, {id: 'save', title: 'Saved', figure: '320.00'}, {id: 'score', title: 'Credit score', figure: '742'}]" />
      </div></section>
      <section class="gate" data-component="carousel" aria-labelledby="aw7-28-h"><h2 id="aw7-28-h">Carousel</h2><div class="gate-body">
        <bx-carousel [slides]="[{title: 'Travel insurance', text: 'Cover for the whole family'}, {title: 'Home loans', text: 'From 6.9% a year'}]" /><div data-variant="fade"><bx-carousel variant="fade" [slides]="[{title: 'Travel insurance', text: 'Cover for the whole family'}, {title: 'Home loans', text: 'From 6.9% a year'}]" /></div><div data-variant="scale"><bx-carousel variant="scale" [slides]="[{title: 'Travel insurance', text: 'Cover for the whole family'}, {title: 'Home loans', text: 'From 6.9% a year'}]" /></div>
      </div></section>
      <section class="gate" data-component="elastic-slider" aria-labelledby="aw7-29-h"><h2 id="aw7-29-h">Elastic slider</h2><div class="gate-body">
        <bx-elastic-slider label="Amount" [value]="500" prefix="USD" />
      </div></section>
      <section class="gate" data-component="option-wheel" aria-labelledby="aw7-30-h"><h2 id="aw7-30-h">Option wheel</h2><div class="gate-body">
        <bx-option-wheel label="Tenure" [options]="['3 months', '6 months', '12 months']" value="6 months" />
      </div></section>
      <section class="gate" data-component="pill-nav" aria-labelledby="aw7-31-h"><h2 id="aw7-31-h">Pill navigation</h2><div class="gate-body">
        <bx-pill-nav [items]="['Accounts', 'Payments', 'Cards']" selection="Accounts" />
      </div></section>
      <section class="gate" data-component="dock-nav" aria-labelledby="aw7-32-h"><h2 id="aw7-32-h">Dock navigation</h2><div class="gate-body">
        <bx-dock-nav [items]="[{id: 'pay', label: 'Pay', icon: '↗'}, {id: 'cards', label: 'Cards', icon: '▭'}, {id: 'help', label: 'Help', icon: '?'}]" />
      </div></section>
      <section class="gate" data-component="card-nav" aria-labelledby="aw7-33-h"><h2 id="aw7-33-h">Card navigation</h2><div class="gate-body">
        <bx-card-nav [items]="[{id: 'loans', title: 'Loans', text: 'Home, car, personal'}, {id: 'cards', title: 'Cards', text: 'Credit and debit'}]" />
      </div></section>
      <section class="gate" data-component="staggered-menu" aria-labelledby="aw7-34-h"><h2 id="aw7-34-h">Staggered menu</h2><div class="gate-body">
        <bx-staggered-menu [items]="['Statements', 'Settings', 'Sign out']" />
      </div></section>
      <section class="gate" data-component="document-folder" aria-labelledby="aw7-35-h"><h2 id="aw7-35-h">Document folder</h2><div class="gate-body">
        <bx-document-folder [items]="[{id: 'd1', title: 'Statement December', meta: 'PDF · 120 KB'}, {id: 'd2', title: 'Tax certificate 2025', meta: 'PDF'}]" />
      </div></section>
      <section class="gate" data-component="scroll-stack" aria-labelledby="aw7-36-h"><h2 id="aw7-36-h">Scroll stack</h2><div class="gate-body">
        <bx-scroll-stack [items]="[{title: 'Choose an account', text: 'Savings or current'}, {title: 'Verify', text: 'Your ID and a selfie'}]" />
      </div></section>
      <section class="gate" data-component="profile-card" aria-labelledby="aw7-37-h"><h2 id="aw7-37-h">Profile card</h2><div class="gate-body">
        <bx-profile-card name="Priya Nair" jobTitle="Relationship manager" [items]="[{label: 'Phone', value: '+44 20 7946 0123'}]" actionLabel="Send a message" />
      </div></section>
      <section class="gate" data-component="glass-panel" aria-labelledby="aw7-38-h"><h2 id="aw7-38-h">Glass panel</h2><div class="gate-body">
        <bx-glass-panel><p>The screen's own content</p></bx-glass-panel><div data-variant="frosted"><bx-glass-panel variant="frosted"><p>The screen's own content</p></bx-glass-panel></div><div data-variant="clear"><bx-glass-panel variant="clear"><p>The screen's own content</p></bx-glass-panel></div>
      </div></section>
      <section class="gate" data-component="gradient-backdrop" aria-labelledby="aw7-39-h"><h2 id="aw7-39-h">Gradient backdrop</h2><div class="gate-body">
        <bx-gradient-backdrop><p>The screen's own content</p></bx-gradient-backdrop><div data-variant="ocean"><bx-gradient-backdrop variant="ocean"><p>The screen's own content</p></bx-gradient-backdrop></div><div data-variant="sunset"><bx-gradient-backdrop variant="sunset"><p>The screen's own content</p></bx-gradient-backdrop></div><div data-variant="calm"><bx-gradient-backdrop variant="calm"><p>The screen's own content</p></bx-gradient-backdrop></div>
      </div></section>
      <section class="gate" data-component="soft-aurora" aria-labelledby="aw7-40-h"><h2 id="aw7-40-h">Soft aurora</h2><div class="gate-body">
        <bx-soft-aurora><p>The screen's own content</p></bx-soft-aurora><div data-variant="ocean"><bx-soft-aurora variant="ocean"><p>The screen's own content</p></bx-soft-aurora></div><div data-variant="sunset"><bx-soft-aurora variant="sunset"><p>The screen's own content</p></bx-soft-aurora></div><div data-variant="calm"><bx-soft-aurora variant="calm"><p>The screen's own content</p></bx-soft-aurora></div>
      </div></section>
      <section class="gate" data-component="silk-backdrop" aria-labelledby="aw7-41-h"><h2 id="aw7-41-h">Silk backdrop</h2><div class="gate-body">
        <bx-silk-backdrop><p>The screen's own content</p></bx-silk-backdrop><div data-variant="ocean"><bx-silk-backdrop variant="ocean"><p>The screen's own content</p></bx-silk-backdrop></div><div data-variant="sunset"><bx-silk-backdrop variant="sunset"><p>The screen's own content</p></bx-silk-backdrop></div><div data-variant="calm"><bx-silk-backdrop variant="calm"><p>The screen's own content</p></bx-silk-backdrop></div>
      </div></section>
      <section class="gate" data-component="dot-grid" aria-labelledby="aw7-42-h"><h2 id="aw7-42-h">Dot grid</h2><div class="gate-body">
        <bx-dot-grid><p>The screen's own content</p></bx-dot-grid><div data-variant="ocean"><bx-dot-grid variant="ocean"><p>The screen's own content</p></bx-dot-grid></div><div data-variant="sunset"><bx-dot-grid variant="sunset"><p>The screen's own content</p></bx-dot-grid></div><div data-variant="calm"><bx-dot-grid variant="calm"><p>The screen's own content</p></bx-dot-grid></div>
      </div></section>
      <section class="gate" data-component="line-waves" aria-labelledby="aw7-43-h"><h2 id="aw7-43-h">Line waves</h2><div class="gate-body">
        <bx-line-waves><p>The screen's own content</p></bx-line-waves><div data-variant="ocean"><bx-line-waves variant="ocean"><p>The screen's own content</p></bx-line-waves></div><div data-variant="sunset"><bx-line-waves variant="sunset"><p>The screen's own content</p></bx-line-waves></div><div data-variant="calm"><bx-line-waves variant="calm"><p>The screen's own content</p></bx-line-waves></div>
      </div></section>
      <section class="gate" data-component="light-beams" aria-labelledby="aw7-44-h"><h2 id="aw7-44-h">Light beams</h2><div class="gate-body">
        <bx-light-beams><p>The screen's own content</p></bx-light-beams><div data-variant="ocean"><bx-light-beams variant="ocean"><p>The screen's own content</p></bx-light-beams></div><div data-variant="sunset"><bx-light-beams variant="sunset"><p>The screen's own content</p></bx-light-beams></div><div data-variant="calm"><bx-light-beams variant="calm"><p>The screen's own content</p></bx-light-beams></div>
      </div></section>
      <section class="gate" data-component="topography" aria-labelledby="aw7-45-h"><h2 id="aw7-45-h">Topography</h2><div class="gate-body">
        <bx-topography><p>The screen's own content</p></bx-topography><div data-variant="ocean"><bx-topography variant="ocean"><p>The screen's own content</p></bx-topography></div><div data-variant="sunset"><bx-topography variant="sunset"><p>The screen's own content</p></bx-topography></div><div data-variant="calm"><bx-topography variant="calm"><p>The screen's own content</p></bx-topography></div>
      </div></section>
      <section class="gate" data-component="particle-backdrop" aria-labelledby="aw7-46-h"><h2 id="aw7-46-h">Particle backdrop</h2><div class="gate-body">
        <bx-particle-backdrop><p>The screen's own content</p></bx-particle-backdrop><div data-variant="ocean"><bx-particle-backdrop variant="ocean"><p>The screen's own content</p></bx-particle-backdrop></div><div data-variant="sunset"><bx-particle-backdrop variant="sunset"><p>The screen's own content</p></bx-particle-backdrop></div><div data-variant="calm"><bx-particle-backdrop variant="calm"><p>The screen's own content</p></bx-particle-backdrop></div>
      </div></section>
      <section class="gate" data-component="slide-to-confirm" aria-labelledby="aw7-47-h"><h2 id="aw7-47-h">Slide to confirm</h2><div class="gate-body">
        <bx-slide-to-confirm label="Slide to pay 1,250.00" />
      </div></section>
      <section class="gate" data-component="hold-to-confirm" aria-labelledby="aw7-48-h"><h2 id="aw7-48-h">Hold to confirm</h2><div class="gate-body">
        <bx-hold-to-confirm label="Hold to close the account" />
      </div></section>
      <section class="gate" data-component="otp-slots" aria-labelledby="aw7-49-h"><h2 id="aw7-49-h">OTP slots</h2><div class="gate-body">
        <bx-otp-slots value="12" />
      </div></section>
      <section class="gate" data-component="receipt-tear" aria-labelledby="aw7-50-h"><h2 id="aw7-50-h">Torn receipt</h2><div class="gate-body">
        <bx-receipt-tear [amount]="1250" currency="USD" reference="FX-20391" />
      </div></section>
      <section class="gate" data-component="success-check" aria-labelledby="aw7-51-h"><h2 id="aw7-51-h">Success check</h2><div class="gate-body">
        <bx-success-check label="Payment sent" text="1,250.00 USD to A. Rao" />
      </div></section>
      <section class="gate" data-component="swipe-row" aria-labelledby="aw7-52-h"><h2 id="aw7-52-h">Swipe row</h2><div class="gate-body">
        <bx-swipe-row heading="Coffee House" meta="Today 08:14" value="-4.50" [actions]="[{value: 'split', label: 'Split'}, {value: 'dispute', label: 'Dispute', tone: 'danger'}]" /><div data-variant="smooth"><bx-swipe-row variant="smooth" heading="Coffee House" meta="Today 08:14" value="-4.50" [actions]="[{value: 'split', label: 'Split'}, {value: 'dispute', label: 'Dispute', tone: 'danger'}]" /></div><div data-variant="snappy"><bx-swipe-row variant="snappy" heading="Coffee House" meta="Today 08:14" value="-4.50" [actions]="[{value: 'split', label: 'Split'}, {value: 'dispute', label: 'Dispute', tone: 'danger'}]" /></div>
      </div></section>
      <section class="gate" data-component="swipe-toast" aria-labelledby="aw7-53-h"><h2 id="aw7-53-h">Swipe toast</h2><div class="gate-body">
        <bx-swipe-toast message="Saved as a payee" />
      </div></section>
      <section class="gate" data-component="bell-toggle" aria-labelledby="aw7-54-h"><h2 id="aw7-54-h">Bell toggle</h2><div class="gate-body">
        <bx-bell-toggle [value]="true" />
      </div></section>
      <section class="gate" data-component="squish-switch" aria-labelledby="aw7-55-h"><h2 id="aw7-55-h">Squish switch</h2><div class="gate-body">
        <bx-squish-switch label="Round up to save" [value]="true" />
      </div></section>
      <section class="gate" data-component="jelly-radio" aria-labelledby="aw7-56-h"><h2 id="aw7-56-h">Jelly radio</h2><div class="gate-body">
        <bx-jelly-radio label="Card design" [options]="['Midnight', 'Ocean', 'Sunrise']" value="Ocean" />
      </div></section>
      <section class="gate" data-component="glide-select" aria-labelledby="aw7-57-h"><h2 id="aw7-57-h">Glide select</h2><div class="gate-body">
        <bx-glide-select label="Show" [options]="['Day', 'Week', 'Month']" value="Week" />
      </div></section>
      <section class="gate" data-component="rubber-segment" aria-labelledby="aw7-58-h"><h2 id="aw7-58-h">Rubber segment</h2><div class="gate-body">
        <bx-rubber-segment label="Period" [options]="['1M', '3M', '1Y']" value="1M" />
      </div></section>
      <section class="gate" data-component="scrub-field" aria-labelledby="aw7-59-h"><h2 id="aw7-59-h">Scrub field</h2><div class="gate-body">
        <bx-scrub-field [value]="250" currency="USD" /><div data-variant="fine"><bx-scrub-field variant="fine" [value]="250" currency="USD" /></div><div data-variant="fast"><bx-scrub-field variant="fast" [value]="250" currency="USD" /></div>
      </div></section>
      <section class="gate" data-component="budget-gauge" aria-labelledby="aw7-60-h"><h2 id="aw7-60-h">Budget gauge</h2><div class="gate-body">
        <bx-budget-gauge label="Groceries" [value]="320" [max]="400" unit="USD" />
      </div></section>
      <section class="gate" data-component="status-mark" aria-labelledby="aw7-61-h"><h2 id="aw7-61-h">Status mark</h2><div class="gate-body">
        <bx-status-mark label="Approved" status="success" />
      </div></section>
      <section class="gate" data-component="favourite-heart" aria-labelledby="aw7-62-h"><h2 id="aw7-62-h">Favourite heart</h2><div class="gate-body">
        <bx-favourite-heart name="A. Rao" [value]="true" />
      </div></section>
      <section class="gate" data-component="peek-rating" aria-labelledby="aw7-63-h"><h2 id="aw7-63-h">Peek rating</h2><div class="gate-body">
        <bx-peek-rating label="How was this payment?" [value]="4" />
      </div></section>
      <section class="gate" data-component="warm-tooltip" aria-labelledby="aw7-64-h"><h2 id="aw7-64-h">Warm tooltip</h2><div class="gate-body">
        <bx-warm-tooltip label="Reward points" text="Points expire after 2 years." />
      </div></section>
      <section class="gate" data-component="prompt-bar" aria-labelledby="aw7-65-h"><h2 id="aw7-65-h">Prompt bar</h2><div class="gate-body">
        <bx-prompt-bar [suggestions]="['What did I spend on travel?', 'When is my card bill due?']" />
      </div></section>
      <section class="gate" data-component="voice-pill" aria-labelledby="aw7-66-h"><h2 id="aw7-66-h">Voice pill</h2><div class="gate-body">
        <bx-voice-pill />
      </div></section>
      <section class="gate" data-component="call-chip" aria-labelledby="aw7-67-h"><h2 id="aw7-67-h">Call chip</h2><div class="gate-body">
        <bx-call-chip number="+44 20 7946 0000" />
      </div></section>
      <section class="gate" data-component="lattice-loader" aria-labelledby="aw7-68-h"><h2 id="aw7-68-h">Lattice loader</h2><div class="gate-body">
        <bx-lattice-loader label="Loading your accounts" />
      </div></section>
    </main>
  `,
})
class Gallery {
  rootClass = styleClasses({ look, mode, motion }) + ' gallery';
  name = signal('A. Sharma');
  amount = signal<number | null>(1250);
  account = signal('S');
  alerts = signal(['E']);
  speed = signal('N');
  day = signal('2026-11-12');
  tab = signal('c');
  selected = signal<readonly string[]>(['t2']);
  bulk = signal<File[] | undefined>([]);
  message = signal('');
  format = signal('PDF');
  terms = signal<string[]>([]);
  income = signal(6000);
  stars = signal(0);
  places = [{ id: 'b1', name: 'London Bridge', type: 'branch', address: '1 Tooley St', distance: '0.4 km', hours: 'Open until 17:00' }, { id: 'a1', name: 'Borough ATM', type: 'atm', address: 'Borough High St', distance: '0.7 km' }];
  chat = [{ id: 'm1', from: 'agent', name: 'Priya', text: 'Hello, how can I help?', time: '10:02' }, { id: 'm2', from: 'customer', text: 'My card is stuck in an ATM.', time: '10:03' }];
  faq = [{ id: 'f1', title: 'How do I reset my password?', body: 'Choose Forgot password on the sign-in page.' }, { id: 'f2', title: 'Is mobile banking secure?', body: 'Yes: every sign-in and payment is checked, and codes expire.' }];
  cats = signal<string[]>([]);
  structure = signal('Sweep');
  signIn = signal(['Passkey']);
  codesBy = signal('SMS');
  theme = signal('System');
  lang = signal('en');
  quiet = signal(true);
  reroute = signal('');
  languages = [{ value: 'en', label: 'English' }, { value: 'ar', label: 'العربية' }, { value: 'fr', label: 'Français' }, { value: 'es', label: 'Español' }];
  approvers = [{ value: 'fh', label: 'Finance head' }, { value: 'tr', label: 'Treasury' }, { value: 'cfo', label: 'CFO' }];
  code = signal('');
  blocked = signal(false);
  emi = signal('6 months');
  points = signal(5000);
  timeoutOpen = signal(false);
  iban = signal('GB29NWBK60161331926819');
  txFilter = signal<string[]>([]);
  maturity = signal('');
  txns = [{ id: 't1', description: 'Coffee House', date: 'Today 08:14', amount: -4.5 }, { id: 't2', description: 'Salary', date: '31 Dec', amount: 3200 }, { id: 't3', description: 'Electricity', date: '28 Dec', amount: -86.2 }];
  saving = signal(5000);
  show = signal('Week');
  navSel = signal('Accounts');
  sheet = signal(false);
  page = signal(2);
  notes = [{ id: 'n1', title: 'Card payment due', meta: 'Due 18 Jan', value: '640.00', unread: true }, { id: 'n2', title: 'New statement ready', meta: 'Today', value: 'Dec' }];
  remarks = signal('Rent for November');
  secret = signal('s3cret-pass');
  copies = signal<number | null>(2);
  currency = signal('INR');
  picked = signal(['S']);
  paperless = signal(true);
  period = signal({ from: '2026-10-01', to: '2026-10-31' });
  query = signal('rent');
  payee = signal('P1');
  proof = signal([new File([new Uint8Array(248000)], 'statement-october.pdf', { type: 'application/pdf' })]);
  payees = [{ value: 'P1', label: 'Asha Sharma' }, { value: 'P2', label: 'Ravi Kumar' }, { value: 'P3', label: 'Asha Patel' }];
  payeeRows = [{ id: 'p1', name: 'A. Rao', meta: 'HSBC ·· 9268' }, { id: 'p2', name: 'J. Mehta', meta: 'Barclays ·· 1180' }];
  accounts = [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }];
  channels = [{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }];
  speeds = [{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }];
  tabs = [{ id: 'c', label: 'Current' }, { id: 's', label: 'Savings' }, { id: 'd', label: 'Deposits' }, { id: 'l', label: 'Loans', disabled: true }];
  panel: Record<string, string> = { c: '2 current accounts', s: '1 savings account', d: '3 deposits', l: '' };
  messages: Message[] = [
    { id: '1', severity: 'error', summary: 'Payment failed', detail: 'The account is blocked. Call the bank.', autoTimeout: 0 },
    { id: '2', severity: 'confirmation', summary: 'Beneficiary added', autoTimeout: 0 },
    { id: '3', severity: 'warning', summary: 'Your session ends in 2 minutes', autoTimeout: 0 },
  ];
  rows = [
    { id: 't1', date: '12 Nov 2026', text: 'Electricity bill', amount: -1240 },
    { id: 't2', date: '11 Nov 2026', text: 'Salary', amount: 85000 },
    { id: 't3', date: '09 Nov 2026', text: 'Card payment', amount: -3499 },
  ];
  columns: Column[] = [
    { field: 'date', headerText: 'Date', sortable: true }, { field: 'text', headerText: 'Description' },
    { field: 'amount', headerText: 'Amount', sortable: true, align: 'end', format: (r) => (r['amount'] as number).toLocaleString('en-IN', { minimumFractionDigits: 2 }) },
  ];
}

bootstrapApplication(Gallery).catch((e) => console.error(e));
