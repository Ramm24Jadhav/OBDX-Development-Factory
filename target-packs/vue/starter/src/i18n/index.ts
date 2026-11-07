import en from './en.json';

type Texts = { [key: string]: string | Texts };

const texts: Texts = en;

/**
 * The text for a key such as "fundTransfer.remarks", with {name} placeholders filled in. Add other languages as
 * more JSON files next to en.json and choose one by the device locale.
 */
export function t(key: string, values: Record<string, string | number> = {}): string {
  const found = key.split('.').reduce<string | Texts | undefined>(
    (node, part) => (node && typeof node === 'object' ? node[part] : undefined), texts);
  const text = typeof found === 'string' ? found : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
