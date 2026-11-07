import { readFileSync } from 'node:fs';
import { Page, expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

/*
 * The React Native pack's gates in a browser (react-native-web): per component, accessibility with contrast (light),
 * themes (dark: contrast holds and the component's colours change), touch targets on a phone (at least 44 points)
 * and a screenshot per theme. Motion is reduced, so every component shows its end state.
 */
const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const URL = 'http://localhost:5184/';
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };

/** The components the gallery draws only alone (?only=id): the keys of SAMPLES in samples.tsx. */
const SAMPLE_IDS = [...readFileSync(new globalThis.URL('../samples.tsx', import.meta.url), 'utf8').matchAll(/^\s+'([a-z0-9-]+)': \[['"]/gm)].map((m) => m[1]);

async function open(page: Page, theme: 'light' | 'dark', only?: string) {
  // Reduced motion before the page loads, so the pack's AccessibilityInfo reads it and every effect is at its end
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
  await page.goto(`${URL}?mode=${theme}${only ? `&only=${only}` : ''}`);
  await page.waitForSelector('[data-gallery-ready]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
}

async function ids(page: Page): Promise<string[]> {
  return page.locator('[data-component]').evaluateAll((els) => els.map((e) => e.getAttribute('data-component')!));
}

async function axe(page: Page, sel: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) { await page.addScriptTag({ path: AXE }); }
  return page.evaluate(async (s) => {
    const w = window as unknown as { axe: { run: (n: Element, o: object) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } };
    const r = await w.axe.run(document.querySelector(s)!, { rules: { region: { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`);
  }, sel);
}

async function colours(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => { const root = document.querySelector(s)!; return Array.from((root.querySelector('.gate-body') ?? root).querySelectorAll<HTMLElement>('*'))
    .map((el) => { const c = getComputedStyle(el); return `${c.backgroundColor} ${c.color} ${c.borderTopColor}`; }).join('|'); }, sel);
}

/** Every control a finger presses is at least 44 by 44 points (the platforms' guidance; the pack aims at 48). */
async function smallTargets(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((s) => {
    const out: string[] = [];
    document.querySelector(s)!.querySelectorAll<HTMLElement>('[role="button"], [role="radio"], [role="checkbox"], [role="tab"], [role="switch"], button, input')
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        // A control drawn inside a larger pressable (the hidden code input, a nested label) is measured by its parent
        if (r.width === 0 || el.closest('[aria-hidden="true"]')) { return; }
        if (r.height < 44 && !el.parentElement?.closest('[role="button"], [role="radio"], [role="checkbox"]')) {
          out.push(`${el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30)} is ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      });
    return out.slice(0, 10);
  }, sel);
}

/**
 * What to check for a component drawn alone: its section, or, when it draws through a Modal (react-native-web puts
 * that in a portal on the body, so the section stays empty), the open overlay.
 */
async function target(page: Page, id: string): Promise<string> {
  const section = `[data-component="${id}"]`;
  if (await page.locator(`${section} .gate-body > *`).count()) { return section; }
  // react-native-web makes the Modal a dialog when its fade-in ends: check the overlay in that end state
  // (the outermost dialog: the Modal itself, not the pack's own panel inside it, which is a dialog from the start)
  const overlay = page.locator('body > div [aria-modal="true"][role="dialog"]:not([role="dialog"] *)').first();
  await overlay.waitFor({ timeout: 10_000 });
  await overlay.evaluate((el, id) => el.setAttribute('data-gate-overlay', id), id);
  return `[data-gate-overlay="${id}"]`;
}

/** The light checks of one section; returns its colours for the dark check. */
async function lightChecks(page: Page, id: string, sel = `[data-component="${id}"]`): Promise<string> {
  expect.soft(await axe(page, sel), `${id} · accessibility (light)`).toEqual([]);
  expect.soft(await smallTargets(page, sel), `${id} · touch targets`).toEqual([]);
  await expect.soft(page.locator(sel), `${id} · screenshot (light)`).toHaveScreenshot(`react-native-${id}-light.png`,
    { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
  return colours(page, sel);
}

async function darkChecks(page: Page, id: string, light: string, sel = `[data-component="${id}"]`) {
  expect.soft(await axe(page, sel), `${id} · accessibility (dark)`).toEqual([]);
  expect.soft(await colours(page, sel), `${id} · the dark theme changes its colours`).not.toBe(light);
  await expect.soft(page.locator(sel), `${id} · screenshot (dark)`).toHaveScreenshot(`react-native-${id}-dark.png`,
    { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
}

test('the gallery shows every section it lists', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await open(page, 'light');
  expect((await ids(page)).length).toBeGreaterThanOrEqual(23);
});

test.describe('react-native', () => {
  test('accessibility, themes, touch targets and screenshots of every section', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await open(page, 'light');
    const all = await ids(page);
    const light: Record<string, string> = {};
    for (const id of all) { light[id] = await lightChecks(page, id); }
    await open(page, 'dark');
    for (const id of all) { await darkChecks(page, id, light[id]); }
  });

  // The components the gallery draws only alone (?only=id), each in a test of its own: the same checks as the sections
  test('every sample the gallery draws alone is listed', () => {
    expect(SAMPLE_IDS.length).toBeGreaterThanOrEqual(180);
  });
  for (const id of SAMPLE_IDS) {
    test(`${id} · accessibility, themes, touch targets and screenshots, drawn alone`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await open(page, 'light', id);
      await expect(page.locator('[data-component]')).toHaveCount(1);
      const light = await lightChecks(page, id, await target(page, id));
      await open(page, 'dark', id);
      await darkChecks(page, id, light, await target(page, id));
    });
  }

  test('nothing scrolls sideways on a phone or a tablet', async ({ page }) => {
    for (const size of [PHONE, TABLET]) {
      await page.setViewportSize(size);
      await open(page, 'light');
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(wide, `${size.width}px wide`).toBeLessThanOrEqual(1);
    }
  });
});
