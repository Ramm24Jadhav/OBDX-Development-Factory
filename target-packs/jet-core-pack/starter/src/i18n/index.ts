import raw = require('text!./en.json');

type Texts = { [key: string]: string | Texts };

// RequireJS's text plugin gives the file as a string; the JET Jest preset gives it parsed
const texts: Texts = typeof raw === 'string' ? JSON.parse(raw) : (raw as Texts);

/**
 * The text for a key such as "fundTransfer.remarks", with {name} placeholders filled in. Add other languages as
 * more JSON files next to en.json and choose one by the browser's language.
 */
export function t(key: string, values: Record<string, string | number> = {}): string {
  const found = key.split('.').reduce<string | Texts | undefined>(
    (node, part) => (node && typeof node === 'object' ? node[part] : undefined), texts);
  const text = typeof found === 'string' ? found : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
