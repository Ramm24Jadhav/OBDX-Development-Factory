import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { TableVariant } from './variants-v2';

export interface Column {
  field: string;
  headerText: string;
  sortable?: boolean;
  /** Numbers and amounts line up on the right. */
  align?: 'start' | 'end';
  /** Shows the cell differently (a masked number); the sort still uses the field. */
  format?: (row: Record<string, unknown>) => string;
}

/** A table (oj-table): sortable headers, single or multiple row selection, an empty state. Paging and filters are wave 4. */
@Component({
  selector: 'bx-data-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div [class]="'bx-grid-wrap' + vcls()" [attr.data-testid]="testID() || null">
      <table class="bx-grid">
        <caption>{{ caption() }}</caption>
        <thead>
          <tr>
            @if (selectable()) { <th scope="col" class="bx-th bx-th-check"><span class="bx-visually-hidden">Select</span></th> }
            @for (c of headers(); track c.field) {
              <th scope="col" [class]="c.css" [attr.aria-sort]="c.sortable ? c.sort : null">
                @if (c.sortable) {
                  <button type="button" class="bx-sort" (click)="toggleSort(c.field)">{{ c.headerText }}<span aria-hidden="true">{{ c.mark }}</span></button>
                } @else { {{ c.headerText }} }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (r of body(); track r.key) {
            <tr [class]="r.on ? 'bx-tr is-selected' : 'bx-tr'" [attr.aria-selected]="selectable() ? r.on : null">
              @if (selectable()) {
                <td class="bx-td bx-td-check">
                  <input [type]="selectionMode() === 'single' ? 'radio' : 'checkbox'" class="bx-check" [checked]="r.on" [attr.aria-label]="'Select row ' + r.key"
                         (change)="toggleRow(r.key)" />
                </td>
              }
              @for (c of r.cells; track $index) { <td [class]="c.css" [attr.data-label]="variant() === 'cards' ? c.label : null">{{ c.text }}</td> }
            </tr>
          }
        </tbody>
      </table>
      @if (!rows().length) { <div class="bx-grid-empty">{{ noData() }}</div> }
    </div>
  `,
})
export class DataTable {
  /** What the table shows; read by screen readers. */
  readonly caption = input.required<string>();
  readonly rows = input<ReadonlyArray<Record<string, unknown>>>([]);
  readonly columns = input<ReadonlyArray<Column>>([]);
  /** The field that identifies a row. */
  readonly keyField = input('id');
  readonly selectionMode = input<'none' | 'single' | 'multiple'>('none');
  readonly selected = model<ReadonlyArray<string>>([]);
  readonly noData = input('No data to show.');
  readonly testID = input('');
  /** The style variant (variants/v2.json); the component's own look when left out. */
  readonly variant = input<'' | TableVariant>('');
  protected readonly vcls = computed(() => (this.variant() && this.variant() !== 'default' ? ` bx-v-${this.variant()}` : ''));
  readonly sorted = output<{ field: string; direction: 'ascending' | 'descending' }>();
  private readonly sort = signal<{ field: string; asc: boolean } | null>(null);

  protected readonly selectable = computed(() => this.selectionMode() !== 'none');
  protected readonly headers = computed(() => this.columns().map((c) => {
    const s = this.sort();
    const on = s?.field === c.field;
    return { ...c, sort: on ? (s!.asc ? 'ascending' : 'descending') : 'none', mark: on ? (s!.asc ? '↑' : '↓') : '',
      css: 'bx-th' + (c.sortable ? ' is-sortable' : '') + (on ? ' is-sorted' : '') + (c.align === 'end' ? ' is-end' : '') };
  }));
  protected readonly body = computed(() => {
    const s = this.sort();
    let list = [...this.rows()];
    if (s) {
      const dir = s.asc ? 1 : -1;
      list = list.sort((a, b) => {
        const x = a[s.field];
        const y = b[s.field];
        if (typeof x === 'number' && typeof y === 'number') { return (x - y) * dir; }
        return String(x ?? '').localeCompare(String(y ?? '')) * dir;
      });
    }
    const chosen = this.selected();
    return list.map((row) => {
      const key = String(row[this.keyField()]);
      return { key, on: chosen.includes(key), cells: this.columns().map((c) => ({
        text: c.format ? c.format(row) : String(row[c.field] ?? ''), css: 'bx-td' + (c.align === 'end' ? ' is-end' : ''), label: c.headerText })) };
    });
  });

  protected toggleSort(field: string): void {
    const s = this.sort();
    const next = s && s.field === field ? { field, asc: !s.asc } : { field, asc: true };
    this.sort.set(next);
    this.sorted.emit({ field, direction: next.asc ? 'ascending' : 'descending' });
  }

  protected toggleRow(key: string): void {
    const chosen = this.selected();
    const on = chosen.includes(key);
    this.selected.set(this.selectionMode() === 'single' ? (on ? [] : [key]) : on ? chosen.filter((k) => k !== key) : [...chosen, key]);
  }
}
