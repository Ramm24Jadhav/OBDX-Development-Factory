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

    // ---------- The forms wave ----------
    const typed = (page: Page, field: string, text: string) => async (side: Side) => {
      const i = page.locator(`#${side}-${field} ${field === 'text-area' ? 'textarea' : 'input'}`).first(); await i.fill(text); await i.press('Tab');
    };
    test('text-area · several lines written back on blur', async ({ page }) => {
      const s = await both(page, typed(page, 'text-area', 'Rent\nNovember'), ['remarks']);
      expect(s.bx.remarks).toBe('Rent\nNovember');
    });

    test('password · value and valid, masked', async ({ page }) => {
      expect((await state(page)).bx.secretValid).toBe((await state(page)).jet.secretValid);
      await both(page, typed(page, 'password', 's3cret'), ['secret', 'secretValid']);
      const s = await both(page, typed(page, 'password', ''), ['secret', 'secretValid']);
      expect(s.bx.secretValid).toBe('invalidShown');
      for (const side of ['jet', 'bx']) { expect(await page.locator(`#${side}-password input`).first().getAttribute('type')).toBe('password'); }
    });

    test('number-input · a number, and out of range is not written', async ({ page }) => {
      await both(page, typed(page, 'number-input', '3'), ['copies']);
      const s = await both(page, typed(page, 'number-input', '9'), ['copies']);
      expect(s.bx.copies).toBe(3);
    });

    test('currency-picker · value', async ({ page }) => {
      const s = await both(page, (side) => page.evaluate((id) => { (document.getElementById(id) as unknown as { value: string }).value = 'EUR'; }, `${side}-currency-picker`), ['currency']);
      expect(s.bx.currency).toBe('EUR');
    });

    test('multi-select · an array of values', async ({ page }) => {
      const s = await both(page, (side) => page.evaluate((id) => { (document.getElementById(id) as unknown as { value: string[] }).value = ['S', 'C']; }, `${side}-multi-select`), ['picked']);
      expect(s.bx.picked).toEqual(['C', 'S']);
    });

    test('switch · a boolean flipped by a click', async ({ page }) => {
      const s = await both(page, async (side) => { await page.locator(`#${side}-switch`).getByRole('switch').first().click(); }, ['paperless']);
      expect(s.bx.paperless).toBe(true);
    });

    test('date-range · the same ISO days as two date fields', async ({ page }) => {
      await page.evaluate(() => {
        (document.getElementById('jet-date-from') as unknown as { value: string }).value = '2026-10-01';
        (document.getElementById('jet-date-to') as unknown as { value: string }).value = '2026-10-31';
      });
      await page.locator('#bx-date-range input[type=date]').nth(0).fill('2026-10-01');
      await page.locator('#bx-date-range input[type=date]').nth(1).fill('2026-10-31');
      await page.waitForTimeout(150);
      const s = await state(page);
      expect(s.bx.period).toEqual(s.jet.period);
      expect(s.bx.period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    });

    test('search · the text written back', async ({ page }) => {
      const s = await both(page, typed(page, 'search', 'rent'), ['query']);
      expect(s.bx.query).toBe('rent');
    });

    test('autocomplete · value', async ({ page }) => {
      const s = await both(page, (side) => page.evaluate((id) => { (document.getElementById(id) as unknown as { value: string }).value = 'P3'; }, `${side}-autocomplete`), ['payee']);
      expect(s.bx.payee).toBe('P3');
    });

    test('document-upload · ojSelect with the chosen file, ojInvalidSelect for a type it does not accept', async ({ page }) => {
      const choose = (name: string, mimeType: string) => async (side: Side) => {
        const chooser = page.waitForEvent('filechooser');
        // JET 6 draws the picker as a drop area without a button role: the element itself is what the customer clicks
        await (side === 'jet' ? page.locator('#jet-document-upload') : page.locator('#bx-document-upload').getByRole('button', { name: 'Choose a file' })).click();
        await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from('%PDF-1.4') });
      };
      const s = await both(page, choose('statement.pdf', 'application/pdf'), ['files']);
      expect(s.bx.files).toEqual(['statement.pdf']);
      // JET 6.2 passes a picked file of any type to ojSelect (accept only filters the browser's chooser); JET 21 refuses it, and so does
      // bx-document-upload on both, so a bank's screen never gets a file type it said it does not take
      const t = await both(page, choose('setup.exe', 'application/octet-stream'), jet === '6' ? [] : ['refusals', 'files']);
      expect(t.bx.refusals).toBe(1);
      expect(t.bx.files).toEqual(['statement.pdf']);
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
