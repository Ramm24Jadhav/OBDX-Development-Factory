/*
 * The Material variant set's gallery (?variant=material): one <section data-component="id"> per component that has a
 * Material variant (variants/v6.json), drawn by MUI and themed from the bank tokens, so ?only=<id>&variant=material shows
 * that component's Material look. Fixed data so screenshots are stable.
 */
import { ReactNode, useState } from 'react';

import {
  MaterialButton, MaterialCard, MaterialCheckboxGroup, MaterialChips, MaterialDialog, MaterialMenu, MaterialProgress, MaterialRadioGroup, MaterialSelect, MaterialSlider,
  MaterialSnackbar, MaterialStepper, MaterialSwitch, MaterialTable, MaterialTabs, MaterialTextField, MaterialTheme,
} from '../src/Material';

const only = new URLSearchParams(location.search).get('only');

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  if (only && only !== id) { return null; }
  return <section className="gate" data-component={id} aria-labelledby={`${id}-h`}><h2 id={`${id}-h`}>{title}</h2><div className="gate-body"><div data-variant="material">{children}</div></div></section>;
}

const accounts = [{ value: 'S', label: 'Savings •••• 4521' }, { value: 'C', label: 'Current •••• 0187' }];
const rows = [{ id: 't1', date: '12 Nov 2026', text: 'Electricity bill', amount: -1240 }, { id: 't2', date: '11 Nov 2026', text: 'Salary', amount: 85000 }];

export function MaterialGallery({ className }: { className: string }) {
  const [name, setName] = useState('A. Sharma');
  const [account, setAccount] = useState('S');
  const [alerts, setAlerts] = useState(['E']);
  const [speed, setSpeed] = useState('N');
  const [on, setOn] = useState(true);
  const [saving, setSaving] = useState(5000);
  const [filters, setFilters] = useState(['Card']);
  const [tab, setTab] = useState('c');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(['t2']);
  return (
    <main className={className + ' gallery'} data-gallery-ready>
      <h1>obdx-react Material variant set</h1>
      <MaterialTheme>
        <Section id="button" title="Button"><div className="gate-row"><MaterialButton label="Pay now" /><MaterialButton label="Save draft" chroming="solid" /><MaterialButton label="Cancel" chroming="outlined" />
          <MaterialButton label="Details" chroming="borderless" /><MaterialButton label="Delete" chroming="danger" /><MaterialButton label="Paying" busy /></div></Section>
        <Section id="secondary-button" title="Secondary button"><MaterialButton label="Save draft" chroming="outlined" /></Section>
        <Section id="danger-button" title="Danger button"><MaterialButton label="Delete payee" chroming="danger" /></Section>
        <Section id="text-field" title="Text field"><MaterialTextField testID="m-tf" label="Beneficiary name" value={name} onChange={setName} required helpText="As it appears on the account" /></Section>
        <Section id="text-area" title="Text area"><MaterialTextField testID="m-ta" label="Remarks" value="Rent for November" multiline /></Section>
        <Section id="password" title="Password"><MaterialTextField testID="m-pw" label="Password" value="s3cret-pass" type="password" /></Section>
        <Section id="search" title="Search"><MaterialTextField testID="m-se" label="Search transactions" value="rent" type="search" /></Section>
        <Section id="select" title="Select"><MaterialSelect testID="m-sel" label="From account" value={account} onChange={setAccount} options={accounts} /></Section>
        <Section id="checkbox-group" title="Checkbox group"><MaterialCheckboxGroup testID="m-cb" label="Alerts" value={alerts} onChange={setAlerts} options={[{ value: 'E', label: 'Email' }, { value: 'S', label: 'SMS' }]} /></Section>
        <Section id="choice-group" title="Choice group"><MaterialRadioGroup testID="m-rg" label="Transfer speed" value={speed} onChange={setSpeed} options={[{ value: 'N', label: 'Normal' }, { value: 'I', label: 'Instant' }]} /></Section>
        <Section id="switch" title="Switch"><MaterialSwitch testID="m-sw" label="Paperless statements" value={on} onChange={setOn} /></Section>
        <Section id="savings-slider" title="Savings slider"><MaterialSlider label="Monthly saving" value={saving} onChange={setSaving} max={20000} step={500} prefix="USD" /></Section>
        <Section id="filter-chips" title="Filter chips"><MaterialChips label="Show" options={['Card', 'Transfer', 'Bill']} value={filters} onChange={setFilters} /></Section>
        <Section id="tabs" title="Tabs"><MaterialTabs label="Accounts" selection={tab} onSelectionChange={setTab}
          tabs={[{ id: 'c', label: 'Current', content: <p>Current account</p> }, { id: 's', label: 'Savings', content: <p>Savings account</p> }]} /></Section>
        <Section id="card" title="Card"><MaterialCard heading="Savings •••• 4521" subheading="Available balance" actions={<MaterialButton label="Details" chroming="borderless" />}><p>12,500.00 USD</p></MaterialCard></Section>
        <Section id="action-menu" title="Action menu"><MaterialMenu label="More" items={['Statements', 'Set a limit', { id: 'block', label: 'Block card', danger: true }]} /></Section>
        <Section id="dialog" title="Dialog"><MaterialButton label="Delete payee" chroming="outlined" onAction={() => setOpen(true)} />
          <MaterialDialog open={open} onOpenChange={setOpen} title="Delete payee?" description="You can add them again later."
                          footer={<><MaterialButton label="Cancel" chroming="borderless" onAction={() => setOpen(false)} /><MaterialButton label="Delete" chroming="danger" onAction={() => setOpen(false)} /></>} /></Section>
        <Section id="toast" title="Toast"><MaterialSnackbar display="general" messages={[{ id: 'm1', severity: 'confirmation', summary: 'Payment sent', detail: 'REF 20931' }]} onClose={() => undefined} /></Section>
        <Section id="data-grid" title="Data grid"><MaterialTable caption="Recent transactions" rows={rows} keyField="id" selectionMode="multiple" selected={selected} onSelectedChange={setSelected}
          columns={[{ field: 'date', headerText: 'Date', sortable: true }, { field: 'text', headerText: 'Description' }, { field: 'amount', headerText: 'Amount', align: 'end' }]} /></Section>
        <Section id="stepper" title="Stepper"><MaterialStepper steps={['Details', 'Review', 'Done']} selectedStep="Review" /></Section>
        <Section id="budget-progress" title="Budget progress"><MaterialProgress heading="Budgets" unit="USD" items={[{ label: 'Groceries', value: 320, max: 400 }, { label: 'Travel', value: 95, max: 300 }]} /></Section>
      </MaterialTheme>
    </main>
  );
}
