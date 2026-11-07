import { Page, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import { THEMES, VIEWPORTS, axe, openGallery } from './gates';

/*
 * The Liquid glass gates (plan row LG5): every part glass.json gives glass, in each web pack's gallery opened with
 * ?look=liquid. Contrast on glass in both themes (axe), the fallbacks (reduced transparency and forced colours drop the
 * frost), a screenshot per theme, and no frame loop running while the page is still (Glisse's follow loop stays off).
 */
const GLASS = (JSON.parse(readFileSync(new URL('../../glass.json', import.meta.url), 'utf8')) as { surfaces: { glass: string[] } }).surfaces.glass;
const PACKS: [string, string, string][] = [
  ['react', 'http://localhost:5181/', 'look=liquid'],
  ['angular', 'http://localhost:5182/gallery/', 'look=liquid'],
  ['jet21', 'http://localhost:5183/gates/jet-gallery.html', 'jet=21&look=liquid'],
];

/** The frosted parts inside a section: anything with a backdrop filter. */
async function frosted(page: Page, sel: string): Promise<number> {
  return page.evaluate((s) => Array.from(document.querySelectorAll(`${s} *`)).filter((el) => {
    const c = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
    return (c.backdropFilter && c.backdropFilter !== 'none') || (c.webkitBackdropFilter && c.webkitBackdropFilter !== 'none');
  }).length, sel);
}

for (const [pack, url, query] of PACKS) {
  test.describe(`${pack} · liquid glass`, () => {
    for (const id of GLASS) {
      const sel = `[data-component="${id}"]`;
      test(`${id} · contrast, fallbacks and screenshots on glass`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS.laptop);
        await openGallery(page, url, 'light', query);
        test.skip((await page.locator(sel).count()) === 0, `${pack} has no ${id} in its gallery`);
        for (const theme of THEMES) {
          await openGallery(page, url, theme, query);
          expect.soft(await axe(page, sel), `${id} · contrast on glass (${theme})`).toEqual([]);
          await expect.soft(page.locator(sel), `${id} · screenshot (${theme})`).toHaveScreenshot(`${pack}-liquid-${id}-${theme}.png`,
            { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
        }
        // Reduced transparency: a solid surface, no frost (Chromium takes the media feature through the protocol)
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
        expect.soft(await frosted(page, sel), `${id} · no frost with reduced transparency`).toBe(0);
        await cdp.send('Emulation.setEmulatedMedia', { features: [] });
        // Forced colours: the system colours, no tint, no frost, and still accessible
        await page.emulateMedia({ forcedColors: 'active' });
        expect.soft(await frosted(page, sel), `${id} · no frost in forced colours`).toBe(0);
        expect.soft(await axe(page, sel), `${id} · accessible in forced colours`).toEqual([]);
        await page.emulateMedia({ forcedColors: 'none' });
      });
    }

    test('no frame loop while the page is still', async ({ page }) => {
      // Count animation frames the page asks for while nothing moves (motion is reduced, the pointer is still)
      await page.addInitScript(() => {
        const w = window as unknown as { __frames: number; requestAnimationFrame: typeof requestAnimationFrame };
        w.__frames = 0;
        const raf = w.requestAnimationFrame.bind(window);
        w.requestAnimationFrame = (cb) => { w.__frames++; return raf(cb); };
      });
      await page.setViewportSize(VIEWPORTS.laptop);
      await openGallery(page, url, 'light', query);
      await page.waitForTimeout(2000);
      const before = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
      await page.waitForTimeout(3000);
      const after = await page.evaluate(() => (window as unknown as { __frames: number }).__frames);
      // A frame loop asks for about 60 frames a second; a still page asks for none (a few for late layout are fine)
      expect(after - before, 'animation frames requested in 3 seconds of stillness').toBeLessThan(30);
    });
  });
}
