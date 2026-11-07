import { readFileSync } from 'node:fs';
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

/** The catalogue's name for each component per pack; a component a pack has no name for is not built there. */
const CATALOGUE = JSON.parse(readFileSync(new URL('../../catalogue.json', import.meta.url), 'utf8')) as { categories: { components: { id: string; names?: Record<string, string> }[] }[] };
const NAMED = new Map(CATALOGUE.categories.flatMap((c) => c.components).map((e) => [e.id, e.names || {}]));

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

      // One test per component, so record.mjs can put each one's result in packs.json
      test('button · the same role and name', async ({ page }) => {
        await expect(jet.locator('#jet-button').getByRole('button', { name: 'Pay now' })).toHaveCount(1);
        await expect(page.locator('[data-component="button"]').getByRole('button', { name: 'Pay now' })).toHaveCount(1);
      });

      test('icon-button · the same role and name', async ({ page }) => {
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

      test('multi-select · an array of values', async ({ page }) => {
        await setJet(jet, 'jet-multi-select', ['S', 'C']);
        await input(page, 'ms1').click();
        await field(page, 'ms1').getByRole('option', { name: 'Current •••• 0187' }).click();
        await settle(page);
        expect((await jetState(jet)).picked).toEqual(['C', 'S']);
        for (const label of ['Savings •••• 4521', 'Current •••• 0187']) { await expect(field(page, 'ms1').getByRole('button', { name: `Remove ${label}` })).toHaveCount(1); }
      });

      // ---------- Groups 1 to 4: the rest of the components that replace a JET element ----------
      const section = (page: Page, id: string) => page.locator(`[data-component="${id}"]`);
      /** The labels appear in this order in the element's text. */
      const inOrder = async (el: Locator, labels: readonly string[]) => {
        // Lists draw their rows after the page is ready, so wait for every label first
        await expect.poll(async () => { const t = await el.innerText(); return labels.filter((l) => !t.includes(l)); }, `${labels.join(', ')} all shown`).toEqual([]);
        const text = await el.innerText();
        const at = labels.map((l) => text.indexOf(l));
        expect(at, 'in the same order').toEqual([...at].sort((a, b) => a - b));
      };
      /** A component the pack does not build has nothing to compare. */
      const built = (id: string) => test.skip(!NAMED.get(id)?.[pack], `${pack} does not build ${id}`);

      for (const [id, name, key] of [['secondary-button', 'Save for later', 'secondaryPresses'], ['danger-button', 'Cancel payment', 'dangerPresses']]) {
        test(`${id} · the same role and name, enabled`, async ({ page }) => {
          built(id);
          await jet.locator(`#jet-${id}`).getByRole('button', { name }).click();
          await settle(jet);
          expect((await jetState(jet))[key]).toBe(1);
          await expect(section(page, id).getByRole('button', { name }).first()).toBeEnabled();
        });
      }

      for (const [id, to] of [['segmented', 'Month'], ['repeat', 'Monthly']]) {
        test(`${id} · one value, picked by its label`, async ({ page }) => {
          built(id);
          await jet.locator(`#jet-${id}`).getByText(to, { exact: true }).first().click();
          await section(page, id).getByRole('radio', { name: to }).click();
          await settle(jet);
          expect((await jetState(jet))[id === 'segmented' ? 'show' : 'repeat']).toBe(to);
          await expect(section(page, id).getByRole('radio', { name: to })).toHaveAttribute('aria-checked', 'true');
          await expect(section(page, id).getByRole('radio', { checked: true })).toHaveCount(1);
        });
      }

      test('action-menu · a menu of actions; picking one closes it', async ({ page }) => {
        await jet.locator('#jet-action-menu').getByRole('button', { name: 'Account actions' }).click();
        await jet.getByRole('menuitem', { name: 'Set a nickname' }).click();
        await settle(jet);
        expect((await jetState(jet)).menuPicked).toBe('nickname');
        const menu = section(page, 'action-menu');
        await menu.getByRole('button', { name: 'More' }).click();
        await expect(menu.getByRole('menu')).toBeVisible();
        await menu.getByRole('menuitem', { name: 'Set a nickname' }).click();
        await expect(menu.getByRole('menuitem')).toHaveCount(0);
      });

      test('accordion · a section opened, its body shown', async ({ page }) => {
        built('accordion');
        await jet.locator('#jet-accordion').getByText('How long does a transfer take?', { exact: true }).click();
        await settle(jet);
        expect((await jetState(jet)).faq).toEqual(['a']);
        await expect(jet.locator('#jet-accordion').getByText('Same day inside the bank', { exact: false })).toBeVisible();
        const head = section(page, 'accordion').getByRole('button', { name: 'How long does a transfer take?' });
        await head.click();
        await expect(head).toHaveAttribute('aria-expanded', 'true');
        await expect(section(page, 'accordion').getByRole('region', { name: 'How long does a transfer take?' })).toContainText('Same day inside the bank');
      });

      for (const [id, labels, current] of [['stepper', ['Details', 'Review', 'Done'], 'Review'], ['payment-status', ['Initiated', 'Approved', 'Sent', 'Completed'], 'Sent'],
        ['kyc-steps', ['ID', 'Selfie', 'Address'], 'Selfie']] as const) {
        test(`${id} · the same steps in order, the selected one current`, async ({ page }) => {
          built(id);
          await inOrder(jet.locator(`#jet-${id}`), labels);
          await inOrder(section(page, id), labels);
          await expect(section(page, id).locator('[aria-current="step"]')).toContainText(current);
        });
      }

      test('side-nav · the selection written back', async ({ page }) => {
        await jet.locator('#jet-side-nav').getByText('Payments', { exact: true }).click();
        await section(page, 'side-nav').getByRole('button', { name: 'Payments' }).click();
        await settle(jet);
        expect((await jetState(jet)).nav).toBe('Payments');
        await expect(section(page, 'side-nav').getByRole('button', { name: 'Payments' })).toHaveAttribute('aria-current', 'page');
      });

      test('sheet · a modal with its heading; Escape closes it', async ({ page }) => {
        await jet.locator('#jet-sheet-opener').focus();
        await jet.evaluate(() => (document.getElementById('jet-sheet') as unknown as { open: (launcher: string) => void }).open('#jet-sheet-opener'));
        // The stock JET popup is the reference for what shows; Escape closing it is required of the pack below
        await expect(jet.locator('#jet-sheet').getByText('Choose what to show.', { exact: true })).toBeVisible();
        await jet.evaluate(() => (document.getElementById('jet-sheet') as unknown as { close: () => void }).close());
        await expect(jet.locator('#jet-sheet').getByText('Choose what to show.', { exact: true })).toBeHidden();
        // JET 21 fires ojClose after its close animation
        await expect.poll(async () => (await jetState(jet)).sheetCloses).toBe(1);
        await section(page, 'sheet').getByRole('button', { name: 'Filter' }).click();
        const sheet = page.getByRole('dialog', { name: 'Filter transactions' });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText('Choose what to show.')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
      });

      test('pagination · the next page written back', async ({ page }) => {
        await jet.locator('#jet-pagination').getByRole('button', { name: 'Next Page', exact: true }).click();
        await settle(jet);
        expect((await jetState(jet)).page).toBe(2);
        const pages = section(page, 'pagination');
        const before = Number(await pages.locator('[aria-current="page"]').innerText());
        await pages.getByRole('button', { name: 'Next page' }).click();
        await expect(pages.locator('[aria-current="page"]')).toHaveText(String(before + 1));
      });

      test('tooltip · the note shown with focus on the term, hidden by Escape', async ({ page }) => {
        const note = 'What you can spend now: the balance less holds and pending card payments.';
        await jet.locator('#jet-tooltip-term').focus();
        await jet.evaluate(() => (document.getElementById('jet-tooltip') as unknown as { open: (launcher: string) => void }).open('#jet-tooltip-term'));
        await expect(jet.locator('#jet-tooltip').getByText(note)).toBeVisible();
        // A stock oj-popup stays open on Escape while focus is on the term; the pack must close (WCAG 1.4.13)
        await section(page, 'tooltip').getByRole('button', { name: 'About Available balance' }).focus();
        await expect(section(page, 'tooltip').getByRole('tooltip')).toHaveText(note);
        await page.keyboard.press('Escape');
        await expect(section(page, 'tooltip').getByText(note)).toBeHidden();
      });

      for (const [id, text, role] of [['alert-banner', 'Transfers after 6 pm arrive the next working day.', 'status'],
        ['error-message', 'The amount is more than your daily limit of 5,000.00.', 'alert'], ['success-message', 'Payment sent. Reference FX-20391.', 'status']] as const) {
        test(`${id} · the same message shown`, async ({ page }) => {
          await expect(jet.locator(`#jet-${id}`).getByText(text)).toBeVisible();
          await expect(section(page, id).getByRole(role).filter({ hasText: text })).toBeVisible();
        });
      }

      test('account-picker · the value chosen', async ({ page }) => {
        await setJet(jet, 'jet-account-picker', 'C');
        await input(page, 'ap1').selectOption('C');
        await settle(page);
        expect((await jetState(jet)).fromAccount).toBe('C');
        await expect(input(page, 'ap1')).toHaveValue('C');
      });

      test('iban · a valid IBAN written back; one that fails the checksum refused with a message', async ({ page }) => {
        const plain = async () => (await input(page, 'ib1').inputValue()).replace(/\s+/g, '');
        await type(jet, jet.locator('#jet-iban input').first(), 'GB82WEST12345698765432');
        await type(page, input(page, 'ib1'), 'GB82 WEST 1234 5698 7654 32');
        expect((await jetState(jet)).iban).toBe('GB82WEST12345698765432');
        expect(await plain()).toBe('GB82WEST12345698765432');
        await type(jet, jet.locator('#jet-iban input').first(), 'GB28NWBK60161331926819');
        await type(page, input(page, 'ib1'), 'GB28NWBK60161331926819');
        expect((await jetState(jet)).iban).toBe('GB82WEST12345698765432');
        expect((await jetState(jet)).ibanValid).toBe('invalidShown');
        expect(await showsError(field(page, 'ib1'), input(page, 'ib1'))).toBe(true);
      });

      for (const [id, names, pick, key, value] of [['payee-list', ['A. Rao', 'J. Mehta'], 'J. Mehta', 'payeePicked', 'p2'],
        ['transaction-list', ['Coffee House', 'Salary', 'Electricity'], 'Salary', 'txPicked', 't2']] as const) {
        test(`${id} · the same rows in order, each one a control`, async ({ page }) => {
          await inOrder(jet.locator(`#jet-${id}`), names);
          await jet.locator(`#jet-${id}`).getByText(pick, { exact: true }).first().click();
          await settle(jet);
          expect((await jetState(jet))[key]).toBe(value);
          const rows = section(page, id).locator('[data-testid]').first();
          await inOrder(rows, names);
          if (id === 'payee-list') { await expect(rows.getByRole('button', { name: pick })).toHaveCount(1); }
        });
      }

      test('otp · the code written back', async ({ page }) => {
        await type(jet, jet.locator('#jet-otp input').first(), '123456');
        await type(page, field(page, 'ot1').locator('input'), '123456');
        expect((await jetState(jet)).otp).toBe('123456');
        await expect(field(page, 'ot1').locator('input')).toHaveValue('123456');
        await expect(field(page, 'ot1').getByLabel('Enter the code')).toHaveCount(1);
      });

      test('session-timeout · a modal named by its title; Stay signed in closes it', async ({ page }) => {
        await jet.evaluate(() => (document.getElementById('jet-session-timeout') as unknown as { open: () => void }).open());
        const jetDialog = jet.getByRole('dialog', { name: 'Are you still there?' });
        await expect(jetDialog).toBeVisible();
        await jetDialog.getByRole('button', { name: 'Stay signed in' }).click();
        await expect.poll(async () => (await jetState(jet)).timeoutOpen).toBe(false);
        expect((await jetState(jet)).timeoutActions).toEqual(['stay']);
        await section(page, 'session-timeout').getByRole('button', { name: 'Show the warning' }).click();
        const dialog = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: 'Are you still there?' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleName('Are you still there?');
        await expect(dialog.getByRole('button', { name: 'Sign out' })).toHaveCount(1);
        await dialog.getByRole('button', { name: 'Stay signed in' }).click();
        await expect(dialog).toHaveCount(0);
      });

      test('sensitive · masked until shown, then the same number as the JET field', async ({ page }) => {
        const full = await jet.evaluate(() => (document.getElementById('jet-sensitive') as unknown as { value: string }).value);
        const sf = field(page, 'sf1');
        await expect(sf.getByRole('group', { name: 'Card number' })).toHaveCount(1);
        await expect(sf.getByText(full)).toHaveCount(0);
        await sf.getByRole('button', { name: 'Show Card number' }).click();
        await expect(sf.getByText(full)).toBeVisible();
      });

      test('spending-chart · the same months and figures as oj-chart', async ({ page }) => {
        const jetBars = await jet.evaluate(async () => {
          const c = document.getElementById('jet-spending-chart') as unknown as { getDataItem: (s: number, g: number) => { group: unknown; value: number } | null };
          for (let i = 0; i < 50 && !(c.getDataItem && c.getDataItem(0, 4)); i++) { await new Promise((r) => setTimeout(r, 100)); }
          return [0, 1, 2, 3, 4].map((g) => { const d = c.getDataItem(0, g); return d ? { label: String(d.group), value: Number(d.value) } : null; });
        });
        const bars = await section(page, 'spending-chart').locator('.bx-bar').evaluateAll((list) => list.map((b) => ({
          label: (b.querySelector('.bx-bar-label')?.textContent || '').trim(), value: Number((b.querySelector('.bx-bar-value')?.textContent || '').replace(/[^\d.-]/g, '')) })));
        expect(bars).toEqual(jetBars);
      });

      test('budget-progress · a progressbar with the same name, value and maximum', async ({ page }) => {
        // JET 6.2's oj-progress sets role="progress", not progressbar, so the JET bar is found by its id and named by its label
        const jetBar = jet.locator('#jet-budget-progress');
        await expect(jet.locator(`#${await jetBar.getAttribute('aria-labelledby')}`)).toHaveText('Groceries');
        const bar = section(page, 'budget-progress').getByRole('progressbar').first();
        await expect(bar).toHaveAccessibleName('Groceries');
        for (const attr of ['aria-valuenow', 'aria-valuemax']) {
          expect(Number(await bar.getAttribute(attr)), attr).toBe(Number(await jetBar.getAttribute(attr)));
        }
      });
    });
  }
}
