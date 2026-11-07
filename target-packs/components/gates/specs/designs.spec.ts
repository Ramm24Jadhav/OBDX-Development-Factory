import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

import { FORMS, FOUNDATION, G1, G2, G3, G4, G5, G6, G7, THEMES, VIEWPORTS, axe, layout, openGallery } from './gates';

/*
 * The design gates: every component in each web pack's gallery under each of the nine designs, in light and dark: axe
 * with contrast, and nothing running past its section, so a design that breaks a component fails. Each variant
 * variants.json lists as built is checked the same way, alone (?only=<id>&variant=<id>). A screenshot of every component
 * per design and theme (JET 21) is kept with the results to look at.
 * They run only when GATES_DESIGN names the designs (a comma list, or all): CI runs one job per design.
 */
const LOOKS = ['elevated', 'soft', 'glass', 'outline', 'vivid', 'pill', 'brutal', 'redwood', 'liquid'];
const asked = process.env.GATES_DESIGN ?? '';
const DESIGNS = asked === 'all' ? LOOKS : asked.split(',').filter((d) => LOOKS.includes(d));
const ALL = [...FOUNDATION, ...FORMS, ...G1, ...G2, ...G3, ...G4, ...G5, ...G6, ...G7];
const PACKS: [string, string, string, string][] = [
  ['react', 'http://localhost:5181/', '', 'react'],
  ['angular', 'http://localhost:5182/gallery/', '', 'angular'],
  ['jet21', 'http://localhost:5183/gates/jet-gallery.html', 'jet=21', 'jet-premium'],
];
type Variants = { components: Record<string, { variants: { id: string; built: string[] }[] }> };
const VARIANTS = (JSON.parse(readFileSync(new URL('../../variants.json', import.meta.url), 'utf8')) as Variants).components;
const builtIn = (pack: string) => Object.entries(VARIANTS).flatMap(([id, c]) => c.variants.filter((v) => v.id !== 'default' && v.built.includes(pack)).map((v) => [id, v.id]));
const q = (...parts: string[]) => parts.filter(Boolean).join('&');

test.describe('designs', () => {
  test.skip(DESIGNS.length === 0, 'set GATES_DESIGN to a design, a comma list or all');
  for (const [pack, url, query, registry] of PACKS) {
    for (const design of DESIGNS) {
      for (const theme of THEMES) {
        test(`${pack} · ${design} · ${theme} · every component`, async ({ page }, info) => {
          test.setTimeout(30 * 60_000);
          await page.setViewportSize(VIEWPORTS.laptop);
          await openGallery(page, url, theme, q(query, 'look=' + design));
          let seen = 0;
          for (const id of ALL) {
            const sel = `[data-component="${id}"]`;
            if ((await page.locator(sel).count()) === 0) { continue; }
            seen++;
            expect.soft(await axe(page, sel), `${id} · ${design} · ${theme}`).toEqual([]);
            expect.soft(await layout(page, sel, false), `${id} · ${design} · ${theme} · layout`).toEqual([]);
            if (pack === 'jet21') {
              await page.locator(sel).screenshot({ path: info.outputPath(`${design}-${theme}-${id}.png`), animations: 'disabled', caret: 'hide' }).catch(() => undefined);
            }
          }
          expect(seen, 'components in the gallery').toBeGreaterThan(200);
        });
      }
      test(`${pack} · ${design} · every built variant alone`, async ({ page }) => {
        test.setTimeout(10 * 60_000);
        await page.setViewportSize(VIEWPORTS.laptop);
        for (const [id, variant] of builtIn(registry)) {
          const sel = `[data-component="${id}"]`;
          for (const theme of THEMES) {
            await openGallery(page, url, theme, q(query, 'look=' + design, 'only=' + id, 'variant=' + variant));
            // the variant's own element is shown, and only it
            expect.soft(await page.locator(`${sel} [data-variant="${variant}"]`).isVisible(), `${id} · ${variant} shows`).toBe(true);
            expect.soft(await axe(page, sel), `${id} · ${variant} · ${design} · ${theme}`).toEqual([]);
          }
        }
      });
    }
  }
});
