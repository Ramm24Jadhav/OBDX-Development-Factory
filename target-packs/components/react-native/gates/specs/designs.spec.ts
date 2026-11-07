import { readFileSync } from 'node:fs';
import { Page, expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

/*
 * The React Native pack's design gates (react-native-web): every component of the gallery and its samples under each
 * of the nine designs, in light and dark: axe with contrast, so a design that breaks a component fails; a screenshot of
 * each per design and theme is kept with the results. Each variant variants.json lists as built for React Native is
 * checked alone (?only=<id>&variant=<id>). They run only when GATES_DESIGN names the designs (a comma list, or all).
 */
const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const URL = 'http://localhost:5184/';
const LOOKS = ['elevated', 'soft', 'glass', 'outline', 'vivid', 'pill', 'brutal', 'redwood', 'liquid'];
const asked = process.env.GATES_DESIGN ?? '';
const DESIGNS = asked === 'all' ? LOOKS : asked.split(',').filter((d) => LOOKS.includes(d));
type Variants = { components: Record<string, { variants: { id: string; built: string[] }[] }> };
const VARIANTS = (JSON.parse(readFileSync(new globalThis.URL('../../../variants.json', import.meta.url), 'utf8')) as Variants).components;
const BUILT = Object.entries(VARIANTS).flatMap(([id, c]) => c.variants.filter((v) => v.id !== 'default' && v.built.includes('react-native')).map((v) => [id, v.id]));

async function open(page: Page, theme: 'light' | 'dark', query: string) {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
  await page.goto(`${URL}?mode=${theme}&${query}`);
  await page.waitForSelector('[data-gallery-ready]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

async function axe(page: Page, sel: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) { await page.addScriptTag({ path: AXE }); }
  return page.evaluate(async (s) => {
    const w = window as unknown as { axe: { run: (n: Element, o: object) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } };
    const r = await w.axe.run(document.querySelector(s)!, { rules: { region: { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`);
  }, sel);
}

test.describe('designs', () => {
  test.skip(DESIGNS.length === 0, 'set GATES_DESIGN to a design, a comma list or all');
  for (const design of DESIGNS) {
    for (const theme of ['light', 'dark'] as const) {
      test(`react-native · ${design} · ${theme} · every component`, async ({ page }, info) => {
        test.setTimeout(30 * 60_000);
        await page.setViewportSize({ width: 768, height: 1024 });
        await open(page, theme, `look=${design}&samples=all`);
        const ids = await page.locator('[data-component]').evaluateAll((els) => els.map((e) => e.getAttribute('data-component')!));
        expect(ids.length, 'components in the gallery').toBeGreaterThan(150);
        for (const id of ids) {
          const sel = `[data-component="${id}"]`;
          expect.soft(await axe(page, sel), `${id} · ${design} · ${theme}`).toEqual([]);
          await page.locator(sel).screenshot({ path: info.outputPath(`${design}-${theme}-${id}.png`), animations: 'disabled', caret: 'hide' }).catch(() => undefined);
        }
      });
    }
    test(`react-native · ${design} · every built variant alone`, async ({ page }) => {
      for (const [id, variant] of BUILT) {
        for (const theme of ['light', 'dark'] as const) {
          await open(page, theme, `look=${design}&only=${id}&variant=${variant}`);
          const sel = `[data-component="${id}"]`;
          expect.soft(await page.locator(`${sel} [data-variant="${variant}"]`).isVisible(), `${id} · ${variant} shows`).toBe(true);
          expect.soft(await axe(page, sel), `${id} · ${variant} · ${design} · ${theme}`).toEqual([]);
        }
      }
    });
  }
});
