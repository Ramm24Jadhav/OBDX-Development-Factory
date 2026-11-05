import axe from 'axe-core';

/**
 * Runs axe on a rendered component. Colour contrast needs a real browser (jsdom does not lay out or paint), so it is
 * checked by the browser gates; 'region' is for whole pages, not one component.
 */
export async function violations(node: Element = document.body): Promise<string[]> {
  const result = await axe.run(node, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}
