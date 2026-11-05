import { Page, expect, test } from '@playwright/test';

/*
 * Parity with the JET elements: each Oracle JET element and the premium element that replaces it sit in one real JET
 * app (jet-parity.html), each bound to its own observables. Every test does the same thing to both and checks that the
 * screen's view model sees the same: values written back, events, methods, names and what is shown. Run on JET 6.2
 * (what OBDX 22.1 ships) and the current release.
 */
type Side = 'jet' | 'bx';
const URL = 'http://localhost:5183/gates/jet-parity.html';

async function open(page: Page, jet: string) {
  await page.goto(`${URL}?jet=${jet}`);
  await page.waitForSelector('[data-parity-ready]', { timeout: 60_000 });
}

const state = (page: Page) => page.evaluate(() => (window as unknown as { parityState: () => Record<Side, Record<string, unknown>> }).parityState());

/** Runs the same action on both sides, then checks the named view model values match (and returns them). */
async function both(page: Page, action: (side: Side) => Promise<void>, keys: string[]) {
  await action('jet');
  await action('bx');
  await page.waitForTimeout(150);
  const s = await state(page);
  for (const k of keys) { expect.soft(s.bx[k], `${k}: bx-… must match oj-…`).toEqual(s.jet[k]); }
  return s;
}

for (const jet of ['6', '21']) {
  test.describe(`parity on JET ${jet}`, () => {
    test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1280, height: 900 }); await open(page, jet); });

    test('text-field · value, raw value and valid', async ({ page }) => {
      expect((await state(page)).bx.textValid).toBe('invalidHidden');
      await both(page, async (s) => { const i = page.locator(`#${s}-text-field input`); await i.fill('A. Sharma'); await i.press('Tab'); }, ['text', 'textRaw', 'textValid']);
      const s = await both(page, async (side) => { const i = page.locator(`#${side}-text-field input`); await i.fill(''); await i.press('Tab'); }, ['text', 'textValid']);
      expect(s.bx.textValid).toBe('invalidShown');
    });

    test('amount · a number written back', async ({ page }) => {
      const s = await both(page, async (side) => { const i = page.locator(`#${side}-amount input`); await i.fill('1250.5'); await i.press('Tab'); }, ['amount']);
      expect(s.bx.amount).toBe(1250.5);
    });

    test('select · value', async ({ page }) => {
      const s = await both(page, (side) => page.evaluate((id) => { (document.getElementById(id) as unknown as { value: string }).value = 'C'; }, `${side}-select`), ['account']);
      expect(s.bx.account).toBe('C');
    });

    test('checkbox-group · choosing and clearing values', async ({ page }) => {
      await both(page, async (side) => { await page.locator(`#${side}-checkbox-group`).getByRole('checkbox', { name: 'SMS' }).click(); }, ['alerts']);
      const s = await both(page, async (side) => { await page.locator(`#${side}-checkbox-group`).getByRole('checkbox', { name: 'Email' }).click(); }, ['alerts']);
      expect(s.bx.alerts).toEqual(['E', 'M']);
    });

    test('choice-group · one value', async ({ page }) => {
      const s = await both(page, async (side) => { await page.locator(`#${side}-choice-group`).getByRole('radio', { name: 'IMPS' }).click(); }, ['speed']);
      expect(s.bx.speed).toBe('I');
    });

    test('date · an ISO value', async ({ page }) => {
      const s = await both(page, (side) => page.evaluate((id) => { (document.getElementById(id) as unknown as { value: string }).value = '2026-11-12'; }, `${side}-date`), ['day']);
      expect(s.bx.day).toBe('2026-11-12');
    });

    test('button · on-oj-action', async ({ page }) => {
      const s = await both(page, async (side) => { await page.locator(`#${side}-button`).getByRole('button').click(); }, ['presses']);
      expect(s.bx.presses).toBe(1);
    });

    test('icon-button · named by its label, on-oj-action', async ({ page }) => {
      for (const side of ['jet', 'bx']) { await expect(page.locator(`#${side}-icon-button`).getByRole('button', { name: 'More actions' })).toHaveCount(1); }
      const s = await both(page, async (side) => { await page.locator(`#${side}-icon-button`).getByRole('button', { name: 'More actions' }).click(); }, ['iconPresses']);
      expect(s.bx.iconPresses).toBe(1);
    });

    test('dialog · open(), isOpen(), close() and ojClose', async ({ page }) => {
      const run = (side: Side) => page.evaluate(async (id) => {
        const d = document.getElementById(id) as unknown as { open: () => void; close: () => void; isOpen: () => boolean };
        d.open();
        await new Promise((r) => setTimeout(r, 400));
        const opened = d.isOpen();
        const named = !!document.querySelector(`[role="dialog"][aria-labelledby]`);
        d.close();
        // JET animates the close; wait until it says it is closed (at most two seconds)
        for (let i = 0; i < 20 && d.isOpen(); i++) { await new Promise((r) => setTimeout(r, 100)); }
        return { opened, closedAfter: !d.isOpen(), named };
      }, `${side}-dialog`);
      const jetResult = await run('jet');
      const bxResult = await run('bx');
      expect(bxResult).toEqual(jetResult);
      expect(bxResult.opened).toBe(true);
      const s = await state(page);
      expect(s.bx.closes).toBe(s.jet.closes);
      expect(s.bx.closes).toBe(1);
    });

    test('toast · the same messages shown', async ({ page }) => {
      const shown = async (side: Side) => {
        const el = page.locator(`#${side}-toast`);
        await expect(el.getByText('Payment failed')).toBeVisible();
        await expect(el.getByText('Beneficiary added')).toBeVisible();
        return el.getByRole('alert').count();
      };
      expect(await shown('bx')).toBeGreaterThanOrEqual(1);
      await shown('jet');
    });

    test('tabs · selection written back', async ({ page }) => {
      const s = await both(page, async (side) => { await page.locator(`#${side}-tabs`).getByRole('tab', { name: 'Savings' }).click(); }, ['tab']);
      expect(s.bx.tab).toBe('s');
    });

    test('data-grid · the same headers and rows from a data provider', async ({ page }) => {
      const table = async (side: Side) => {
        const el = page.locator(`#${side}-data-grid`);
        await expect(el.getByText('Electricity bill')).toBeVisible();
        const headers = (await el.getByRole('columnheader').allInnerTexts()).map((t) => t.replace(/[↑↓]/g, '').trim().toLowerCase())
          // The selection column is each element's own (JET 21 draws it without a header name)
          .filter((t) => t && t !== 'select row');
        const cells = await el.getByRole('cell').allInnerTexts();
        return { headers, rows: cells.map((t) => t.trim()).filter((t) => /Electricity bill|Salary|Card payment/.test(t)) };
      };
      expect(await table('bx')).toEqual(await table('jet'));
    });
  });
}
