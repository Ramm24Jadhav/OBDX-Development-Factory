/*
 * The gallery the browser gates run on: every foundation component in its main states, one <section
 * data-component="id"> each, in the theme the URL asks for (?mode=light|dark). Fixed data so screenshots are stable.
 */
// The gallery runs in JIT mode, like the unit tests (Analog compiles the decorators); a bank's build compiles AOT
import '@angular/compiler';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { Column, Message, OBDX_COMPONENTS, styleClasses } from '../src';
import '../src/bx.css';
import './gallery.css';

const mode = new URLSearchParams(location.search).get('mode') === 'dark' ? 'dark' : 'light';

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
    </main>
  `,
})
class Gallery {
  rootClass = styleClasses({ look: 'elevated', mode }) + ' gallery';
  name = signal('A. Sharma');
  amount = signal<number | null>(1250);
  account = signal('S');
  alerts = signal(['E']);
  speed = signal('N');
  day = signal('2026-11-12');
  tab = signal('c');
  selected = signal<readonly string[]>(['t2']);
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
