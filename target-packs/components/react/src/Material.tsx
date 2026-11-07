/*
 * The Material 3 variants (variants-v2.ts MATERIAL), drawn with @mui/material core (MIT). Each keeps the bx- classes,
 * roles and events of the pack's own markup, so the bank skin, the tests and the screens see the same component.
 */
import MuiCard from '@mui/material/Card';
import MuiTab from '@mui/material/Tab';
import MuiTable from '@mui/material/Table';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableCell from '@mui/material/TableCell';
import MuiTableHead from '@mui/material/TableHead';
import MuiTableRow from '@mui/material/TableRow';
import MuiTabs from '@mui/material/Tabs';
import { ElementType, createElement } from 'react';

import { isMaterial } from './variants-v2';

const Card = MuiCard as ElementType;

/** The root of a card, tile or row: a MUI Card (a Material surface) for the Material variants, else the plain element. */
export function Surface({ as, kind, variant, ...rest }: { as: ElementType; kind: string; variant?: string; [attr: string]: unknown }) {
  if (!isMaterial(kind, variant)) { return createElement(as, rest); }
  return <Card component={as} variant={variant === 'outlined' ? 'outlined' : 'elevation'} elevation={variant === 'elevated' ? 1 : 0} {...rest} />;
}

export interface StripTab { id: string; label: string; disabled?: boolean }

/**
 * Material tabs (MUI Tabs): arrow keys move and choose (selectionFollowsFocus), Home and End jump; each tab controls
 * the panel id the caller gives.
 */
export function MaterialTabStrip({ label, labelledBy, tabs, selection, onChange, idOf, panelOf, scrollable, className, testID }: {
  label?: string; labelledBy?: string; tabs: ReadonlyArray<StripTab>; selection: string; onChange: (id: string) => void; idOf: (id: string) => string;
  panelOf: (id: string) => string | undefined; scrollable?: boolean; className: string; testID?: string;
}) {
  return (
    <MuiTabs value={selection} onChange={(_e: unknown, v: string) => onChange(v)} aria-label={label} aria-labelledby={labelledBy} selectionFollowsFocus
             variant={scrollable ? 'scrollable' : 'standard'} scrollButtons={scrollable ? 'auto' : false} className={className}>
      {tabs.map((t) => (
        <MuiTab key={t.id} value={t.id} label={t.label} disabled={t.disabled} id={idOf(t.id)} aria-controls={panelOf(t.id)}
                className={'bx-tab' + (t.id === selection ? ' is-on' : '')} data-testid={testID ? `${testID}-${t.id}` : undefined} />
      ))}
    </MuiTabs>
  );
}

const PlainCell = ({ component = 'td', ...rest }: { component?: ElementType; [attr: string]: unknown }) => createElement(component, rest);
const PLAIN: Record<'Table' | 'Head' | 'Body' | 'Row' | 'Cell', ElementType> = { Table: 'table', Head: 'thead', Body: 'tbody', Row: 'tr', Cell: PlainCell };
const MATERIAL_TABLE: Record<'Table' | 'Head' | 'Body' | 'Row' | 'Cell', ElementType> = { Table: MuiTable, Head: MuiTableHead, Body: MuiTableBody, Row: MuiTableRow, Cell: MuiTableCell };

/** The elements of a table: MUI's table parts for the Material variant, else the plain table, thead, tbody, tr and td (or th). */
export const tableParts = (variant?: string) => (isMaterial('table', variant) ? MATERIAL_TABLE : PLAIN);
