import { ReactNode, useMemo, useState } from 'react';

export interface Column<R> {
  /** The row field shown in the column. */
  field: keyof R & string;
  headerText: string;
  sortable?: boolean;
  /** Numbers and amounts line up on the right. */
  align?: 'start' | 'end';
  /** Shows the cell differently (a masked number, a status pill); the sort still uses the field. */
  render?: (row: R) => ReactNode;
}

export interface DataTableProps<R> {
  /** What the table shows; read by screen readers. */
  caption: string;
  rows: ReadonlyArray<R>;
  columns: ReadonlyArray<Column<R>>;
  /** The field that identifies a row. */
  keyField: keyof R & string;
  selectionMode?: 'none' | 'single' | 'multiple';
  selected?: ReadonlyArray<string>;
  onSelectedChange?: (keys: string[]) => void;
  onSort?: (field: string, direction: 'ascending' | 'descending') => void;
  noData?: ReactNode;
  testID?: string;
}

/** A table (oj-table): sortable headers, single or multiple row selection, an empty state. Paging and filters are wave 4. */
export function DataTable<R extends object>({ caption, rows, columns, keyField, selectionMode = 'none', selected = [], onSelectedChange, onSort, noData,
                                             testID }: DataTableProps<R>) {
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
  const selectable = selectionMode !== 'none';
  const keyOf = (row: R) => String((row as Record<string, unknown>)[keyField]);
  const toggleRow = (key: string) => {
    const on = selected.includes(key);
    onSelectedChange?.(selectionMode === 'single' ? (on ? [] : [key]) : on ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  return (
    <div className="bx-grid-wrap" data-testid={testID}>
      <table className="bx-grid">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {selectable ? <th scope="col" className="bx-th bx-th-check"><span className="bx-visually-hidden">Select</span></th> : null}
            {columns.map((c) => {
              const on = sort?.field === c.field;
              const css = 'bx-th' + (c.sortable ? ' is-sortable' : '') + (on ? ' is-sorted' : '') + (c.align === 'end' ? ' is-end' : '');
              return (
                <th key={c.field} scope="col" className={css} aria-sort={c.sortable ? (on ? (sort!.asc ? 'ascending' : 'descending') : 'none') : undefined}>
                  {c.sortable
                    ? <button type="button" className="bx-sort" onClick={() => toggleSort(c.field)}>{c.headerText}<span aria-hidden="true">{on ? (sort!.asc ? '↑' : '↓') : ''}</span></button>
                    : c.headerText}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = keyOf(row);
            const on = selected.includes(key);
            return (
              <tr key={key} className={'bx-tr' + (on ? ' is-selected' : '')} aria-selected={selectable ? on : undefined}>
                {selectable
                  ? <td className="bx-td bx-td-check"><input type={selectionMode === 'single' ? 'radio' : 'checkbox'} className="bx-check" checked={on}
                                                             aria-label={`Select row ${key}`} onChange={() => toggleRow(key)} /></td>
                  : null}
                {columns.map((c) => (
                  <td key={c.field} className={'bx-td' + (c.align === 'end' ? ' is-end' : '')}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.field] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="bx-grid-empty">{noData ?? 'No data to show.'}</div> : null}
    </div>
  );
}
