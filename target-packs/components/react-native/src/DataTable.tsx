import { ReactNode, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Enter, Press } from './motion';

import { useTheme } from './theme';

export interface Column<R> {
  field: keyof R & string;
  headerText: string;
  sortable?: boolean;
  align?: 'start' | 'end';
  render?: (row: R) => ReactNode;
}

export interface DataTableProps<R> {
  caption: string;
  rows: ReadonlyArray<R>;
  columns: ReadonlyArray<Column<R>>;
  keyField: keyof R & string;
  selectionMode?: 'none' | 'single' | 'multiple';
  selected?: ReadonlyArray<string>;
  onSelectedChange?: (keys: string[]) => void;
  onSort?: (field: string, direction: 'ascending' | 'descending') => void;
  noData?: string;
  testID?: string;
}

/**
 * A table (oj-table) made for phones: the sortable columns are buttons above the list, and each row is one card that
 * reads as "header: value" pairs, so nothing scrolls sideways. Rows are selectable when selectionMode says so.
 */
export function DataTable<R extends object>({ caption, rows, columns, keyField, selectionMode = 'none', selected = [], onSelectedChange, onSort, noData,
                                             testID }: DataTableProps<R>) {
  const t = useTheme();
  const [sort, setSort] = useState<{ field: string; asc: boolean } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) { return rows; }
    const dir = sort.asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = (a as Record<string, unknown>)[sort.field];
      const y = (b as Record<string, unknown>)[sort.field];
      if (typeof x === 'number' && typeof y === 'number') { return (x - y) * dir; }
      return String(x ?? '').localeCompare(String(y ?? '')) * dir;
    });
  }, [rows, sort]);
  const toggleSort = (field: string) => {
    const next = sort && sort.field === field ? { field, asc: !sort.asc } : { field, asc: true };
    setSort(next);
    onSort?.(field, next.asc ? 'ascending' : 'descending');
  };
  const keyOf = (row: R) => String((row as Record<string, unknown>)[keyField]);
  const toggleRow = (key: string) => {
    const on = selected.includes(key);
    onSelectedChange?.(selectionMode === 'single' ? (on ? [] : [key]) : on ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  const sortable = columns.filter((c) => c.sortable);
  return (
    <View testID={testID} style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ fontSize: 15, fontWeight: '700', color: t.color.text }}>{caption}</Text>
      {sortable.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel="Sort by">
          {sortable.map((c) => {
            const on = sort?.field === c.field;
            const dir = on ? (sort!.asc ? 'ascending' : 'descending') : 'not sorted';
            return (
              <Pressable key={c.field} testID={testID ? `${testID}-sort-${c.field}` : undefined} accessibilityRole="button"
                         accessibilityLabel={`Sort by ${c.headerText}, ${dir}`} onPress={() => toggleSort(c.field)}
                         style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 999, borderWidth: 1,
                           borderColor: on ? t.color.primary : t.color.border, backgroundColor: on ? t.color.primarySoft : t.color.surface }}>
                <Text style={{ fontSize: 13, color: on ? t.color.primaryText : t.color.textBody }}>{c.headerText}{on ? (sort!.asc ? ' ↑' : ' ↓') : ''}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {sorted.length === 0 ? <Text style={{ padding: 24, textAlign: 'center', color: t.color.textMuted }}>{noData ?? 'No data to show.'}</Text> : null}
      {sorted.map((row) => {
        const key = keyOf(row);
        const on = selected.includes(key);
        const cells = columns.map((c) => (
          <View key={c.field} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ fontSize: 12, color: t.color.textMuted, textTransform: 'uppercase' }}>{c.headerText}</Text>
            {c.render ? <View>{c.render(row)}</View>
              : <Text style={{ fontSize: 14, color: t.color.text, textAlign: c.align === 'end' ? 'right' : 'left', fontVariant: c.align === 'end' ? ['tabular-nums'] : undefined }}>
                  {String((row as Record<string, unknown>)[c.field] ?? '')}
                </Text>}
          </View>
        ));
        const box = { gap: 6, padding: 14, borderRadius: t.radius.card, borderWidth: on ? 1.5 : 1, borderColor: on ? t.color.primary : t.color.border,
          backgroundColor: on ? t.color.primarySoft : t.color.surface };
        return selectionMode === 'none'
          ? <Enter key={key} effect="settle" testID={testID ? `${testID}-row-${key}` : undefined} style={box}>{cells}</Enter>
          : (
            <Enter key={key} effect="settle">
              <Press testID={testID ? `${testID}-row-${key}` : undefined} accessibilityRole={selectionMode === 'single' ? 'radio' : 'checkbox'}
                     accessibilityState={{ checked: on }} onPress={() => toggleRow(key)} style={box}>
                {cells}
              </Press>
            </Enter>
          );
      })}
    </View>
  );
}
