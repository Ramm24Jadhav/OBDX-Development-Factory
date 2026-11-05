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
