/*
 * What the React Native and React previews share: the Screen Model shape and the messages with the page that hosts the
 * preview in an iframe (the same protocol as the JET preview): the host sends {type: 'factory-preview', model,
 * highlight}; a click on a field or action answers {type: 'factory-preview-select', id}.
 */
export interface Component {
  id: string;
  type: string;
  name?: string | null;
  label?: string | null;
  required?: boolean | null;
  helpText?: string | null;
  placeholder?: string | null;
  maxLength?: number | null;
  defaultValue?: string | null;
  options?: string[] | null;
  readonly?: boolean | null;
}

export interface Section {
  id: string;
  title?: string | null;
  columns?: number | null;
  components: Component[];
}

export interface Action {
  id: string;
  label: string;
  kind?: string | null;
}

export interface ScreenModel {
  name: string;
  title?: string | null;
  sections: Section[];
  actions: Action[];
}

export type Value = string | boolean | string[];

export const SAMPLE_ACCOUNTS = ['Savings xxxx1234 (INR)', 'Current xxxx5678 (INR)', 'Savings xxxx9012 (USD)'];

/** The options to show: sample accounts for an account field without real options. */
export function optionsOf(c: Component): string[] {
  const options = c.options ?? [];
  if (c.type === 'account' && (options.length === 0 || options[0] === 'Option 1')) {
    return SAMPLE_ACCOUNTS;
  }
  return options;
}

/** The starting value of a field, from its default. */
export function initialValue(c: Component): Value {
  const value = (c.defaultValue ?? '').trim();
  if (c.type === 'switch') {
    return ['true', 'on', 'yes'].includes(value.toLowerCase());
  }
  if (c.type === 'checkbox') {
    return value ? value.split(',').map((v) => v.trim()) : [];
  }
  if (c.type === 'display') {
    return value || 'Sample value';
  }
  return value;
}

/** Listens for models from the host page and reports clicks on fields and actions. */
export function connect(show: (model: ScreenModel | null, highlight: string | null) => void): void {
  let ids = new Set<string>();
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || !event.data || event.data.type !== 'factory-preview') {
      return;
    }
    const model = event.data.model as ScreenModel | null;
    ids = new Set(model ? [...model.sections.flatMap((s) => s.components.map((c) => c.id)), ...model.actions.map((a) => a.id)] : []);
    show(model, event.data.highlight ?? null);
  });
  document.addEventListener('click', (event) => {
    for (let element = event.target as Element | null; element; element = element.parentElement) {
      const id = element.getAttribute('data-testid');
      if (id && ids.has(id)) {
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'factory-preview-select', id }, window.location.origin);
        }
        return;
      }
    }
  }, true);
  if (window.parent !== window) {
    window.parent.postMessage({ type: 'factory-preview-ready' }, window.location.origin);
  }
}

/** CSS that outlines the selected field or action. */
export function highlightCss(id: string | null): string {
  return id ? `[data-testid="${CSS.escape(id)}"] { outline: 2px solid #c35500; outline-offset: 3px; border-radius: 4px; }` : '';
}
