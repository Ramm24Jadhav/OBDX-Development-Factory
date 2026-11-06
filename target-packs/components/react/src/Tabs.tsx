import * as RadixTabs from '@radix-ui/react-tabs';
import { ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  /** The panel for this tab; leave it out to use the tabs as a switch only (oj-tab-bar). */
  content?: ReactNode;
}

export interface TabsProps {
  /** Names the tab list for screen readers. */
  label: string;
  tabs: ReadonlyArray<Tab>;
  selection: string;
  onSelectionChange: (id: string) => void;
  testID?: string;
}

/** Tabs (oj-tab-bar), on Radix Tabs: arrow keys move between tabs, Home and End jump, and the panels are tied to their tabs. */
export function Tabs({ label, tabs, selection, onSelectionChange, testID }: TabsProps) {
  return (
    <RadixTabs.Root value={selection} onValueChange={onSelectionChange} activationMode="automatic" data-testid={testID}>
      <RadixTabs.List className="bx-tabs is-top" aria-label={label}>
        {tabs.map((t) => (
          <RadixTabs.Trigger key={t.id} value={t.id} disabled={t.disabled} className={'bx-tab' + (t.id === selection ? ' is-on' : '')}
                             data-testid={testID ? `${testID}-${t.id}` : undefined}>
            {t.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {tabs.filter((t) => t.content !== undefined).map((t) => (
        <RadixTabs.Content key={t.id} value={t.id} className="bx-tab-panel">{t.content}</RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
