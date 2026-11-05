/*
 * The gallery the browser gates run on: every foundation component in its main states, one <section
 * data-component="id"> each, in the theme the URL asks for (?mode=light|dark). Fixed data so screenshots are stable.
 */
import { ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../src/bx.css';
import { AmountInput, Button, Card, CheckboxGroup, DataTable, DatePicker, Dialog, Dropdown, IconButton, RadioGroup, Tabs, TextField, Toast, styleClasses } from '../src';
import './gallery.css';

const mode = new URLSearchParams(location.search).get('mode') === 'dark' ? 'dark' : 'light';
const accounts = [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }];
const rows = [
  { id: 't1', date: '12 Nov 2026', text: 'Electricity bill', amount: -1240 },
  { id: 't2', date: '11 Nov 2026', text: 'Salary', amount: 85000 },
  { id: 't3', date: '09 Nov 2026', text: 'Card payment', amount: -3499 },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
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
  return (
    <main className={styleClasses({ look: 'elevated', mode }) + ' gallery'} data-gallery-ready>
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
      </Section>
      <Section id="icon-button" title="Icon button">
        <div className="gate-row"><IconButton label="More actions" /><IconButton label="Close" icon="close" chroming="outlined" /><IconButton label="Disabled action" disabled /></div>
      </Section>
      <Section id="text-field" title="Text field">
        <TextField testID="tf1" label="Beneficiary name" value={name} onChange={setName} required maxLength={40} clearable helpText="As it appears on the account" />
        <TextField testID="tf2" label="Reference" value="INV 2041" error="Use letters and numbers only." />
        <TextField testID="tf3" label="Customer ID" value="CUST-00921" readOnly />
      </Section>
      <Section id="amount" title="Amount input">
        <AmountInput testID="am1" label="Amount" currency="INR" locale="en-IN" value={amount} onChange={setAmount} required helpText="Up to 50,000.00 a day" />
        <AmountInput testID="am2" label="Amount" currency="KWD" locale="en-US" value={12.5} error="Enter at most 10.000." />
      </Section>
      <Section id="select" title="Dropdown">
        <Dropdown testID="dd1" label="From account" options={accounts} value={account} onChange={setAccount} required />
        <Dropdown testID="dd2" label="To account" options={accounts} value="" disabled />
      </Section>
      <Section id="checkbox-group" title="Checkbox group">
        <CheckboxGroup testID="cg" label="Send alerts by" options={[{ value: 'E', label: 'Email' }, { value: 'M', label: 'SMS' }, { value: 'P', label: 'Push', disabled: true }]}
                       value={alerts} onChange={setAlerts} />
      </Section>
      <Section id="choice-group" title="Radio group">
        <RadioGroup testID="rg" label="Transfer speed" horizontal options={[{ value: 'N', label: 'NEFT' }, { value: 'R', label: 'RTGS' }, { value: 'I', label: 'IMPS' }]}
                    value={speed} onChange={setSpeed} />
      </Section>
      <Section id="date" title="Date picker">
        <DatePicker testID="dp" label="Pay on" value={day} onChange={setDay} min="2026-11-10" max="2026-12-31" locale="en-GB" />
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
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
