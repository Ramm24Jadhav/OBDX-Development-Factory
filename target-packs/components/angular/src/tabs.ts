import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model } from '@angular/core';

import { nextId } from './field';

export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
}

/**
 * Tabs (oj-tab-bar): a tablist where arrow keys, Home and End move and select, and only the chosen tab is in the tab
 * order. [(selection)] is the chosen tab's id; the screen shows its panel, labelled by tabId(id).
 */
@Component({
  selector: 'bx-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bx-tabs is-top" role="tablist" [attr.aria-label]="label()" [attr.data-testid]="testID() || null" (keydown)="onKey($event)">
      @for (t of rows(); track t.id) {
        <button type="button" role="tab" [id]="t.tabId" [class]="t.css" [attr.aria-selected]="t.on" [attr.tabindex]="t.on ? 0 : -1"
                [attr.aria-controls]="panelId(t.id)" [disabled]="!!t.disabled" (click)="selection.set(t.id)">{{ t.label }}</button>
      }
    </div>
  `,
})
export class Tabs {
  /** Names the tab list for screen readers. */
  readonly label = input.required<string>();
  readonly tabs = input<ReadonlyArray<Tab>>([]);
  readonly selection = model('');
  readonly testID = input('');
  readonly id = nextId('bx-tabs');
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly rows = computed(() => this.tabs().map((t) => {
    const on = t.id === this.selection();
    return { ...t, on, tabId: `${this.id}-${t.id}`, css: 'bx-tab' + (on ? ' is-on' : '') };
  }));

  /** The id to give the panel of a tab (role="tabpanel", aria-labelledby = tabId(id)). */
  panelId(id: string): string { return `${this.id}-${id}-panel`; }
  tabId(id: string): string { return `${this.id}-${id}`; }

  protected onKey(event: KeyboardEvent): void {
    const list = this.tabs().filter((t) => !t.disabled);
    if (!list.length) { return; }
    const at = list.findIndex((t) => t.id === this.selection());
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (at + 1) % list.length
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (at - 1 + list.length) % list.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
    if (next < 0) { return; }
    event.preventDefault();
    this.selection.set(list[next].id);
    queueMicrotask(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('.bx-tab.is-on')?.focus());
  }
}
