import { Locator, Page, expect, test } from '@playwright/test';

/*
 * Parity of a web pack (React, Angular) with the Oracle JET elements its components replace. The JET side is the oj-
 * element on jet-parity.html, bound to Knockout observables (parityState().jet is what a JET screen's view model sees).
 * The pack side is the same component in the pack's gallery, a controlled component: what it shows after an action is
 * what it wrote back, since a component that did not write back would show the old value again. Each test does the
 * same thing to both and compares the outcome. Run on JET 6.2 (what OBDX 22.1 ships) and the current release.
 */
const JET = 'http://localhost:5183/gates/jet-parity.html';

type JetState = Record<string, unknown>;

async function openJet(page: Page, release: string) {
  await page.goto(`${JET}?jet=${release}`);
  await page.waitForSelector('[data-parity-ready]', { timeout: 60_000 });
}

const jetState = (page: Page): Promise<JetState> =>
  page.evaluate(() => (window as unknown as { parityState: () => { jet: Record<string, unknown> } }).parityState().jet);

/** Sets a JET element's value property, as a screen's binding does. */
const setJet = (page: Page, id: string, value: unknown) =>
  page.evaluate(([el, v]) => { (document.getElementById(el as string) as unknown as { value: unknown }).value = v; }, [id, value] as const);

const field = (page: Page, testID: string) => page.locator(`[data-testid="${testID}"]`);
const input = (page: Page, testID: string) => page.locator(`[data-testid="${testID}-input"]`);
/** A field shows its error: the input is aria-invalid or an alert is shown in the field. */
const showsError = async (wrapper: Locator, control: Locator) =>
  (await control.getAttribute('aria-invalid')) === 'true' || (await wrapper.getByRole('alert').count()) > 0;
const settle = (page: Page) => page.waitForTimeout(150);

async function type(page: Page, control: Locator, text: string) {
  await control.fill(text);
  await control.press('Tab');
  await settle(page);
}

export function webParity(pack: string, gallery: string) {
  for (const release of ['6', '21']) {
    test.describe(`${pack} parity with JET ${release}`, () => {
      let jet: Page;
      test.beforeEach(async ({ page, context }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(gallery);
        await page.waitForSelector('[data-gallery-ready]', { timeout: 30_000 });
        jet = await context.newPage();
        await jet.setViewportSize({ width: 1280, height: 900 });
        await openJet(jet, release);
      });

      test('text-field · value written back, and the required message when cleared', async ({ page }) => {
        await type(jet, jet.locator('#jet-text-field input'), 'A. Sharma');
        await type(page, input(page, 'tf1'), 'A. Sharma');
        expect((await jetState(jet)).text).toBe('A. Sharma');
        await expect(input(page, 'tf1')).toHaveValue('A. Sharma');
        await type(jet, jet.locator('#jet-text-field input'), '');
        await type(page, input(page, 'tf1'), '');
        expect((await jetState(jet)).textValid).toBe('invalidShown');
        expect(await showsError(field(page, 'tf1'), input(page, 'tf1'))).toBe(true);
      });

      test('amount · the same number written back', async ({ page }) => {
        await type(jet, jet.locator('#jet-amount input'), '1250.5');
        await type(page, input(page, 'am1'), '1250.5');
        const shown = Number((await input(page, 'am1').inputValue()).replace(/[^0-9.-]/g, ''));
        expect(shown).toBe((await jetState(jet)).amount);
        expect(shown).toBe(1250.5);
      });

      test('select · the value chosen', async ({ page }) => {
        await setJet(jet, 'jet-select', 'C');
        await input(page, 'dd1').selectOption('C');
        await settle(page);
        expect((await jetState(jet)).account).toBe('C');
        await expect(input(page, 'dd1')).toHaveValue('C');
      });

      test('checkbox-group · a value added and taken away', async ({ page }) => {
        const pick = async () => {
          await jet.locator('#jet-checkbox-group').getByRole('checkbox', { name: 'SMS' }).click();
          await field(page, 'cg').getByRole('checkbox', { name: 'SMS' }).click();
          await settle(jet);
        };
        await pick();
        expect(await field(page, 'cg').getByRole('checkbox', { name: 'SMS' }).isChecked()).toBe(((await jetState(jet)).alerts as string[]).includes('M'));
        await pick();
        expect(await field(page, 'cg').getByRole('checkbox', { name: 'SMS' }).isChecked()).toBe(((await jetState(jet)).alerts as string[]).includes('M'));
      });

      test('choice-group · one value', async ({ page }) => {
        await jet.locator('#jet-choice-group').getByRole('radio', { name: 'IMPS' }).click();
        await field(page, 'rg').getByRole('radio', { name: 'IMPS' }).click();
        await settle(jet);
        expect((await jetState(jet)).speed).toBe('I');
        await expect(field(page, 'rg').getByRole('radio', { name: 'IMPS' })).toBeChecked();
        await expect(field(page, 'rg').getByRole('radio', { name: 'NEFT' })).not.toBeChecked();
      });

      test('date · an ISO day', async ({ page }) => {
        await setJet(jet, 'jet-date', '2026-11-20');
        await input(page, 'dp').fill('2026-11-20');
        await settle(page);
        expect((await jetState(jet)).day).toBe('2026-11-20');
        await expect(input(page, 'dp')).toHaveValue('2026-11-20');
      });

      test('button and icon-button · the same roles and names', async ({ page }) => {
        await expect(jet.locator('#jet-button').getByRole('button', { name: 'Pay now' })).toHaveCount(1);
        await expect(page.locator('[data-component="button"]').getByRole('button', { name: 'Pay now' })).toHaveCount(1);
        await expect(jet.locator('#jet-icon-button').getByRole('button', { name: 'More actions' })).toHaveCount(1);
        await expect(page.locator('[data-component="icon-button"]').getByRole('button', { name: 'More actions' })).toHaveCount(1);
      });

      test('dialog · a modal dialog named by its title', async ({ page }) => {
        await jet.evaluate(() => (document.getElementById('jet-dialog') as unknown as { open: () => void }).open());
        await jet.waitForTimeout(400);
        await expect(jet.getByRole('dialog', { name: 'Delete A. Sharma?' })).toBeVisible();
        const dialog = page.locator('[data-component="dialog"]').getByRole('dialog', { name: 'Delete A. Sharma?' });
        await expect(dialog).toBeVisible();
      });

      test('toast · the same messages, the error as an alert', async ({ page }) => {
        for (const text of ['Payment failed', 'Beneficiary added']) {
          await expect(jet.locator('#jet-toast').getByText(text)).toBeVisible();
          await expect(page.locator('[data-component="toast"]').getByText(text)).toBeVisible();
        }
        expect(await page.locator('[data-component="toast"]').getByRole('alert').count()).toBeGreaterThanOrEqual(1);
      });

      test('tabs · the selection written back', async ({ page }) => {
        await jet.locator('#jet-tabs').getByRole('tab', { name: 'Savings' }).click();
        await page.locator('[data-component="tabs"]').getByRole('tab', { name: 'Savings' }).click();
        await settle(jet);
        expect((await jetState(jet)).tab).toBe('s');
        await expect(page.locator('[data-component="tabs"]').getByRole('tab', { name: 'Savings' })).toHaveAttribute('aria-selected', 'true');
      });

      test('data-grid · the same headers and rows', async ({ page }) => {
        const table = async (el: Locator) => {
          await expect(el.getByText('Electricity bill')).toBeVisible();
          const headers = (await el.getByRole('columnheader').allInnerTexts()).map((t) => t.replace(/[↑↓]/g, '').trim().toLowerCase())
            .filter((t) => t && t !== 'select row' && t !== 'select');
          const cells = await el.getByRole('cell').allInnerTexts();
          return { headers, rows: cells.map((t) => t.trim()).filter((t) => /Electricity bill|Salary|Card payment/.test(t)) };
        };
        expect(await table(page.locator('[data-component="data-grid"]'))).toEqual(await table(jet.locator('#jet-data-grid')));
      });

      // ---------- The forms wave ----------
      test('text-area · several lines written back', async ({ page }) => {
        await type(jet, jet.locator('#jet-text-area textarea').first(), 'Rent\nNovember');
        await type(page, input(page, 'ta1'), 'Rent\nNovember');
        expect((await jetState(jet)).remarks).toBe('Rent\nNovember');
        await expect(input(page, 'ta1')).toHaveValue('Rent\nNovember');
      });

      test('password · written back and masked', async ({ page }) => {
        await type(jet, jet.locator('#jet-password input').first(), 's3cret');
        await type(page, input(page, 'pw1'), 's3cret');
        expect((await jetState(jet)).secret).toBe('s3cret');
        await expect(input(page, 'pw1')).toHaveValue('s3cret');
        expect(await jet.locator('#jet-password input').first().getAttribute('type')).toBe('password');
        await expect(input(page, 'pw1')).toHaveAttribute('type', 'password');
      });

      test('number-input · a number, and out of range refused with a message', async ({ page }) => {
        await type(jet, jet.locator('#jet-number-input input').first(), '3');
        await type(page, input(page, 'ni1'), '3');
        expect((await jetState(jet)).copies).toBe(3);
        await expect(input(page, 'ni1')).toHaveValue('3');
        await type(jet, jet.locator('#jet-number-input input').first(), '9');
        await type(page, input(page, 'ni1'), '9');
        expect((await jetState(jet)).copies).toBe(3);
        expect(await showsError(field(page, 'ni1'), input(page, 'ni1'))).toBe(true);
      });

      test('currency-picker · the value chosen', async ({ page }) => {
        await setJet(jet, 'jet-currency-picker', 'EUR');
        await input(page, 'cp1').selectOption('EUR');
        await settle(page);
        expect((await jetState(jet)).currency).toBe('EUR');
        await expect(input(page, 'cp1')).toHaveValue('EUR');
      });

      test('switch · flipped by a click', async ({ page }) => {
        const before = (await jetState(jet)).paperless;
        const shown = await input(page, 'sw1').getAttribute('aria-checked');
        await jet.locator('#jet-switch').getByRole('switch').first().click();
        await input(page, 'sw1').click();
        await settle(jet);
        expect((await jetState(jet)).paperless).toBe(!before);
        await expect(input(page, 'sw1')).toHaveAttribute('aria-checked', shown === 'true' ? 'false' : 'true');
      });

      test('date-range · the same two ISO days', async ({ page }) => {
        await setJet(jet, 'jet-date-from', '2026-10-01');
        await setJet(jet, 'jet-date-to', '2026-10-31');
        await page.locator('[data-testid="dr1-from"]').fill('2026-10-01');
        await page.locator('[data-testid="dr1-to"]').fill('2026-10-31');
        await settle(page);
        expect((await jetState(jet)).period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
        await expect(page.locator('[data-testid="dr1-from"]')).toHaveValue('2026-10-01');
        await expect(page.locator('[data-testid="dr1-to"]')).toHaveValue('2026-10-31');
      });

      test('search · the text written back', async ({ page }) => {
        await type(jet, jet.locator('#jet-search input').first(), 'rent');
        await type(page, input(page, 'se1'), 'rent');
        expect((await jetState(jet)).query).toBe('rent');
        await expect(input(page, 'se1')).toHaveValue('rent');
      });

      test('autocomplete · a suggestion picked', async ({ page }) => {
        await setJet(jet, 'jet-autocomplete', 'P3');
        await input(page, 'ac1').fill('Asha P');
        await page.getByRole('option', { name: 'Asha Patel' }).click();
        await settle(page);
        expect((await jetState(jet)).payee).toBe('P3');
        await expect(input(page, 'ac1')).toHaveValue('Asha Patel');
      });

      test('document-upload · a file chosen, and a type it does not take refused', async ({ page }) => {
        const choose = async (name: string, mimeType: string) => {
          const chooser = page.waitForEvent('filechooser');
          await field(page, 'du1').getByRole('button', { name: /Choose a file|Add files/ }).click();
          await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from('%PDF-1.4') });
          await settle(page);
        };
        await choose('statement.pdf', 'application/pdf');
        await expect(field(page, 'du1').getByText('statement.pdf')).toBeVisible();
        await choose('setup.exe', 'application/octet-stream');
        await expect(field(page, 'du1').getByRole('alert')).toBeVisible();
        await expect(field(page, 'du1').getByText('setup.exe', { exact: true })).toHaveCount(0);
        // JET 21's oj-file-picker refuses it the same way (JET 6.2 passes any type: see parity.spec.ts)
      });
    });
  }
}
