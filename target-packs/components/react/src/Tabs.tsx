import * as RadixTabs from '@radix-ui/react-tabs';
import { ReactNode, useId } from 'react';

import { Lens } from './lens';
import { MaterialTabStrip } from './Material';
import { TabsVariant, isMaterial, vc } from './variants-v2';

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
  /** The style variant (variants/v2.json); underline and scrollable are Material tabs, vertical stacks them down the side. */
  variant?: TabsVariant;
}

/** Tabs (oj-tab-bar), on Radix Tabs: arrow keys move between tabs, Home and End jump, and the panels are tied to their tabs. */
export function Tabs({ label, tabs, selection, onSelectionChange, testID, variant }: TabsProps) {
  const id = useId();
  if (isMaterial('tabs', variant)) {
    const shown = tabs.find((t) => t.id === selection && t.content !== undefined);
    return (
      <div data-testid={testID}>
        <MaterialTabStrip label={label} tabs={tabs} selection={selection} onChange={onSelectionChange} idOf={(t) => `${id}-t-${t}`}
                          panelOf={(t) => (shown && t === shown.id ? `${id}-p-${t}` : undefined)} scrollable={variant === 'scrollable'}
                          className={'bx-tabs is-top' + vc('tabs', variant)} testID={testID} />
        {shown ? <div role="tabpanel" id={`${id}-p-${shown.id}`} aria-labelledby={`${id}-t-${shown.id}`} tabIndex={0} className="bx-tab-panel">{shown.content}</div> : null}
      </div>
    );
  }
  return (
    <RadixTabs.Root value={selection} onValueChange={onSelectionChange} activationMode="automatic" orientation={variant === 'vertical' ? 'vertical' : 'horizontal'}
                    className={variant === 'vertical' ? 'bx-tabs-vertical' : undefined} data-testid={testID}>
      <RadixTabs.List className={'bx-tabs is-top' + vc('tabs', variant)} aria-label={label}>
        <Lens />
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
