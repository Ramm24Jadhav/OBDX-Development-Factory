import { Locator, Page, expect, test } from '@playwright/test';

/*
 * Parity of the React Native pack with the Oracle JET elements its components replace (every catalogue component whose
 * workspace.kind is element). The JET side is the stock oj- element on gates/jet-parity.html (parityState().jet is what
 * a JET screen's view model sees); the React Native side is the component on parity.html, drawn by react-native-web
 * and controlled by that page's state (window.parityState()). Each test does the same thing to both, the React Native
 * way where its interaction differs (a sheet of choices, a pressable switch, dd/mm/yyyy typed), and compares the value
 * written back, the message shown, roles and names, events and counts. Where stock JET cannot do something the pack must
 * (Escape closing a popup), it is required of React Native only. Run on JET 6.2 (what OBDX 22.1 ships) and JET 21.
 */
const JET = 'http://localhost:5183/gates/jet-parity.html';
const RN = 'http://localhost:5184/parity.html';

type State = Record<string, unknown>;

const jetState = (page: Page): Promise<State> =>
  page.evaluate(() => (window as unknown as { parityState: () => { jet: State } }).parityState().jet);
const rnState = (page: Page): Promise<State> => page.evaluate(() => (window as unknown as { parityState: () => State }).parityState());

/** Sets a JET element's value property, as a screen's binding does. */
const setJet = (page: Page, id: string, value: unknown) =>
  page.evaluate(([el, v]) => { (document.getElementById(el as string) as unknown as { value: unknown }).value = v; }, [id, value] as const);

const section = (page: Page, id: string) => page.locator(`[data-component="${id}"]`);
const field = (page: Page, testID: string) => page.locator(`[data-testid="${testID}"]`);
const input = (page: Page, testID: string) => page.locator(`[data-testid="${testID}-input"]`);
/** A field shows its error: the input is aria-invalid or an alert is shown in the field. */
const showsError = async (wrapper: Locator, control: Locator) =>
  (await control.getAttribute('aria-invalid')) === 'true' || (await wrapper.getByRole('alert').count()) > 0;
const settle = (page: Page) => page.waitForTimeout(150);

async function type(page: Page, control: Locator, text: string) {
  // Focus first: a field may show its text differently in focus (a masked IBAN shows in full)
  await control.focus();
  await control.fill(text);
  await control.press('Tab');
  await settle(page);
}

/** The labels appear in this order in the element's text. */
async function inOrder(el: Locator, labels: readonly string[]) {
  // Lists draw their rows after the page is ready, so wait for every label first
  await expect.poll(async () => { const t = await el.innerText(); return labels.filter((l) => !t.includes(l)); }, `${labels.join(', ')} all shown`).toEqual([]);
  const text = await el.innerText();
  const at = labels.map((l) => text.indexOf(l));
  expect(at, 'in the same order').toEqual([...at].sort((a, b) => a - b));
}

/** Opens a field's sheet of choices and picks one (React Native's Dropdown, CurrencySelector, AccountSelector). */
async function choose(page: Page, testID: string, option: string) {
  await input(page, testID).click();
  const sheet = page.getByRole('dialog').filter({ has: page.getByRole('radio', { name: option, exact: true }) });
  await sheet.getByRole('radio', { name: option, exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await settle(page);
}

for (const release of ['6', '21']) {
  test.describe(`react-native parity with JET ${release}`, () => {
    let jet: Page;
    test.beforeEach(async ({ page, context }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(RN);
      await page.waitForSelector('[data-parity-ready]', { timeout: 60_000 });
      jet = await context.newPage();
      await jet.setViewportSize({ width: 1280, height: 900 });
      await jet.goto(`${JET}?jet=${release}`);
      await jet.waitForSelector('[data-parity-ready]', { timeout: 60_000 });
    });

    /** The named values the React Native screen holds match what the JET screen's view model sees. */
    const same = async (page: Page, keys: string[]) => {
      const [j, r] = [await jetState(jet), await rnState(page)];
      for (const k of keys) { expect.soft(r[k], `${k}: React Native must match oj-…`).toEqual(j[k]); }
      return r;
    };

    test('text-field · value written back, and the required message when cleared', async ({ page }) => {
      await type(jet, jet.locator('#jet-text-field input'), 'A. Sharma');
      await type(page, input(page, 'tf1'), 'A. Sharma');
      expect((await same(page, ['text'])).text).toBe('A. Sharma');
      await type(jet, jet.locator('#jet-text-field input'), '');
      // A cleared required JET field keeps its last value, so only the message is compared (as parity.spec.ts does)
      await type(page, input(page, 'tf1'), '');
      expect((await jetState(jet)).textValid).toBe('invalidShown');
      expect(await showsError(field(page, 'tf1'), input(page, 'tf1'))).toBe(true);
      await expect(input(page, 'tf1')).toHaveAccessibleName('Beneficiary name');
    });

    test('amount · the same number written back', async ({ page }) => {
      await type(jet, jet.locator('#jet-amount input'), '1250.5');
      await type(page, input(page, 'am1'), '1250.5');
      expect((await same(page, ['amount'])).amount).toBe(1250.5);
    });

    test('select · the value chosen from the sheet', async ({ page }) => {
      await setJet(jet, 'jet-select', 'C');
      await choose(page, 'dd1', 'Current •••• 0187');
      expect((await same(page, ['account'])).account).toBe('C');
      await expect(input(page, 'dd1')).toHaveAccessibleName('Current •••• 0187, From account');
    });

    test('checkbox-group · values added in the same order', async ({ page }) => {
      for (const name of ['SMS', 'Email']) {
        await jet.locator('#jet-checkbox-group').getByRole('checkbox', { name }).click();
        await field(page, 'cg').getByRole('checkbox', { name }).click();
        await settle(jet);
        await same(page, ['alerts']);
      }
      expect((await rnState(page)).alerts).toEqual(['E', 'M']);
      await expect(field(page, 'cg').getByRole('checkbox', { name: 'SMS' })).toHaveAttribute('aria-checked', 'true');
    });

    test('choice-group · one value', async ({ page }) => {
      await jet.locator('#jet-choice-group').getByRole('radio', { name: 'IMPS' }).click();
      await field(page, 'rg').getByRole('radio', { name: 'IMPS' }).click();
      await settle(jet);
      expect((await same(page, ['speed'])).speed).toBe('I');
      await expect(field(page, 'rg').getByRole('radio', { name: 'IMPS' })).toHaveAttribute('aria-checked', 'true');
      await expect(field(page, 'rg').getByRole('radio', { name: 'NEFT' })).toHaveAttribute('aria-checked', 'false');
    });

    test('date · an ISO day', async ({ page }) => {
      await setJet(jet, 'jet-date', '2026-11-20');
      await type(page, input(page, 'dp'), '20/11/2026');
      expect((await same(page, ['day'])).day).toBe('2026-11-20');
    });

    for (const [id, name, key] of [['button', 'Pay now', 'presses'], ['icon-button', 'More actions', 'iconPresses'],
      ['secondary-button', 'Save for later', 'secondaryPresses'], ['danger-button', 'Cancel payment', 'dangerPresses']]) {
      test(`${id} · the same role and name, and the action once per press`, async ({ page }) => {
        await jet.locator(`#jet-${id}`).getByRole('button', { name }).click();
        await expect(section(page, id).getByRole('button', { name, exact: true })).toHaveCount(1);
        await section(page, id).getByRole('button', { name, exact: true }).click();
        await settle(jet);
        expect((await same(page, [key]))[key]).toBe(1);
      });
    }

    test('dialog · a modal dialog named by its title; closing it tells the screen once', async ({ page }) => {
      await jet.evaluate(async () => {
        const d = document.getElementById('jet-dialog') as unknown as { open: () => void; close: () => void; isOpen: () => boolean };
        d.open();
        await new Promise((r) => setTimeout(r, 400));
      });
      await expect(jet.getByRole('dialog', { name: 'Delete A. Sharma?' })).toBeVisible();
      await jet.evaluate(() => (document.getElementById('jet-dialog') as unknown as { close: () => void }).close());
      await expect.poll(async () => (await jetState(jet)).closes).toBe(1);
      await section(page, 'dialog').getByRole('button', { name: 'Delete A. Sharma' }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete A. Sharma?' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Payments will stop.')).toBeVisible();
      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(dialog).toHaveCount(0);
      expect((await same(page, ['closes'])).closes).toBe(1);
    });

    test('toast · the same messages, the error as an alert', async ({ page }) => {
      for (const text of ['Payment failed', 'Beneficiary added']) {
        await expect(jet.locator('#jet-toast').getByText(text)).toBeVisible();
        await expect(section(page, 'toast').getByText(text)).toBeVisible();
      }
      await expect(section(page, 'toast').getByRole('alert').filter({ hasText: 'Payment failed' })).toHaveCount(1);
    });

    test('tabs · the selection written back', async ({ page }) => {
      await jet.locator('#jet-tabs').getByRole('tab', { name: 'Savings' }).click();
      await section(page, 'tabs').getByRole('tab', { name: 'Savings' }).click();
      await settle(jet);
      expect((await same(page, ['tab'])).tab).toBe('s');
      await expect(section(page, 'tabs').getByRole('tablist', { name: 'Accounts' })).toHaveCount(1);
      await expect(section(page, 'tabs').getByRole('tab', { name: 'Savings' })).toHaveAttribute('aria-selected', 'true');
    });

    test('data-grid · the same headers and rows', async ({ page }) => {
      const want = /Electricity bill|Salary|Card payment/;
      const el = jet.locator('#jet-data-grid');
      await expect(el.getByText('Electricity bill')).toBeVisible();
      const headers = (await el.getByRole('columnheader').allInnerTexts()).map((t) => t.replace(/[↑↓]/g, '').trim().toLowerCase()).filter((t) => t && t !== 'select row');
      const cells = (await el.getByRole('cell').allInnerTexts()).map((t) => t.trim()).filter((t) => want.test(t));
      // React Native draws each row as a card of "header: value" pairs (a phone has no room for columns)
      await expect(section(page, 'data-grid').getByRole('heading', { name: 'Recent transactions' })).toHaveCount(1);
      const pairs = await section(page, 'data-grid').locator('[data-testid^="dg-row-"]').evaluateAll((list) => list.map((row) =>
        Array.from(row.children).map((p) => Array.from(p.children).map((c) => (c.textContent || '').trim()))));
      const rnHeaders = [...new Set(pairs.flat().map((p) => p[0].toLowerCase()))];
      const rnCells = pairs.flat().map((p) => p[1]).filter((t) => want.test(t));
      expect({ headers: rnHeaders, rows: rnCells }).toEqual({ headers, rows: cells });
    });

    // ---------- The forms wave ----------
    test('text-area · several lines written back', async ({ page }) => {
      await type(jet, jet.locator('#jet-text-area textarea').first(), 'Rent\nNovember');
      await type(page, input(page, 'ta1'), 'Rent\nNovember');
      expect((await same(page, ['remarks'])).remarks).toBe('Rent\nNovember');
    });

    test('password · written back and masked; the required message when cleared', async ({ page }) => {
      await type(jet, jet.locator('#jet-password input').first(), 's3cret');
      await type(page, input(page, 'pw1'), 's3cret');
      expect((await same(page, ['secret'])).secret).toBe('s3cret');
      expect(await jet.locator('#jet-password input').first().getAttribute('type')).toBe('password');
      await expect(input(page, 'pw1')).toHaveAttribute('type', 'password');
      await type(jet, jet.locator('#jet-password input').first(), '');
      await type(page, input(page, 'pw1'), '');
      expect((await jetState(jet)).secretValid).toBe('invalidShown');
      expect(await showsError(field(page, 'pw1'), input(page, 'pw1'))).toBe(true);
    });

    test('number-input · a number, and out of range not written, with a message', async ({ page }) => {
      await type(jet, jet.locator('#jet-number-input input').first(), '3');
      await type(page, input(page, 'ni1'), '3');
      expect((await same(page, ['copies'])).copies).toBe(3);
      await type(jet, jet.locator('#jet-number-input input').first(), '9');
      await type(page, input(page, 'ni1'), '9');
      expect((await same(page, ['copies'])).copies).toBe(3);
      expect(await showsError(field(page, 'ni1'), input(page, 'ni1'))).toBe(true);
    });

    test('currency-picker · the value chosen from the sheet', async ({ page }) => {
      await setJet(jet, 'jet-currency-picker', 'EUR');
      await choose(page, 'cp1', 'EUR, Euro');
      expect((await same(page, ['currency'])).currency).toBe('EUR');
    });

    test('multi-select · an array of values', async ({ page }) => {
      await setJet(jet, 'jet-multi-select', ['S', 'C']);
      await input(page, 'ms1').click();
      const sheet = page.getByRole('dialog', { name: 'Accounts' });
      for (const name of ['Savings •••• 4521', 'Current •••• 0187']) { await sheet.getByRole('checkbox', { name }).click(); }
      await sheet.getByRole('button', { name: 'Done' }).click();
      await expect(sheet).toHaveCount(0);
      expect((await same(page, ['picked'])).picked).toEqual(['C', 'S']);
      for (const label of ['Savings •••• 4521', 'Current •••• 0187']) { await expect(field(page, 'ms1').getByRole('button', { name: `Remove ${label}` })).toHaveCount(1); }
    });

    test('switch · flipped by a press', async ({ page }) => {
      await jet.locator('#jet-switch').getByRole('switch').first().click();
      await field(page, 'sw1').getByRole('switch', { name: 'Paperless statements' }).click();
      await settle(jet);
      expect((await same(page, ['paperless'])).paperless).toBe(true);
      await expect(input(page, 'sw1')).toHaveAttribute('aria-checked', 'true');
    });

    test('date-range · the same two ISO days', async ({ page }) => {
      await setJet(jet, 'jet-date-from', '2026-10-01');
      await setJet(jet, 'jet-date-to', '2026-10-31');
      await type(page, input(page, 'dr1-from'), '01/10/2026');
      await type(page, input(page, 'dr1-to'), '31/10/2026');
      expect((await same(page, ['period'])).period).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    });

    test('search · the text written back', async ({ page }) => {
      await type(jet, jet.locator('#jet-search input').first(), 'rent');
      await type(page, input(page, 'se1'), 'rent');
      expect((await same(page, ['query'])).query).toBe('rent');
      await expect(input(page, 'se1')).toHaveAccessibleName('Search transactions');
    });

    test('autocomplete · a suggestion picked', async ({ page }) => {
      await setJet(jet, 'jet-autocomplete', 'P3');
      await input(page, 'ac1').fill('Asha P');
      await field(page, 'ac1').getByRole('button', { name: 'Asha Patel' }).click();
      await settle(page);
      expect((await same(page, ['payee'])).payee).toBe('P3');
      await expect(input(page, 'ac1')).toHaveValue('Asha Patel');
    });

    test('document-upload · a file chosen, and a type it does not take refused and reported', async ({ page }) => {
      const pickOn = async (p: Page, opener: Locator, name: string, mimeType: string) => {
        const chooser = p.waitForEvent('filechooser');
        await opener.click();
        await (await chooser).setFiles({ name, mimeType, buffer: Buffer.from('%PDF-1.4') });
        await settle(p);
      };
      const opener = field(page, 'du1').getByRole('button', { name: /^Choose a file/ });
      await pickOn(jet, jet.locator('#jet-document-upload'), 'statement.pdf', 'application/pdf');
      await pickOn(page, opener, 'statement.pdf', 'application/pdf');
      expect((await same(page, ['files'])).files).toEqual(['statement.pdf']);
      await expect(field(page, 'du1').getByText('statement.pdf')).toBeVisible();
      await pickOn(jet, jet.locator('#jet-document-upload'), 'setup.exe', 'application/octet-stream');
      await pickOn(page, opener, 'setup.exe', 'application/octet-stream');
      // JET 6.2 passes a picked file of any type to ojSelect; JET 21 refuses it, and so must the pack on both
      if (release === '21') { await same(page, ['files', 'refusals']); }
      const r = await rnState(page);
      expect(r.files).toEqual(['statement.pdf']);
      expect(r.refusals).toBe(1);
      await expect(field(page, 'du1').getByRole('alert')).toContainText('setup.exe');
    });

    // ---------- Groups 1 to 4: the rest of the components that replace a JET element ----------
    for (const [id, key, to] of [['segmented', 'show', 'Month'], ['repeat', 'repeat', 'Monthly']]) {
      test(`${id} · one value, picked by its label`, async ({ page }) => {
        await jet.locator(`#jet-${id}`).getByText(to, { exact: true }).first().click();
        await section(page, id).getByRole('radio', { name: to }).click();
        await settle(jet);
        expect((await same(page, [key]))[key]).toBe(to);
        await expect(section(page, id).getByRole('radiogroup', { name: id === 'segmented' ? 'Show' : 'Repeat' })).toHaveCount(1);
        await expect(section(page, id).getByRole('radio', { name: to })).toHaveAttribute('aria-checked', 'true');
        await expect(section(page, id).getByRole('radio', { checked: true })).toHaveCount(1);
      });
    }

    test('action-menu · the chosen action\'s value; picking one closes it', async ({ page }) => {
      await jet.locator('#jet-action-menu').getByRole('button', { name: 'Account actions' }).click();
      await jet.getByRole('menuitem', { name: 'Set a nickname' }).click();
      await settle(jet);
      // On a phone the menu is a sheet of actions
      await section(page, 'action-menu').getByRole('button', { name: 'More actions' }).click();
      const sheet = page.getByRole('dialog', { name: 'More' });
      await expect(sheet.getByRole('button', { name: 'Download statement' })).toHaveCount(1);
      await sheet.getByRole('button', { name: 'Set a nickname' }).click();
      await expect(sheet).toHaveCount(0);
      expect((await same(page, ['menuPicked'])).menuPicked).toBe('nickname');
    });

    test('accordion · a section opened, written back, its body shown', async ({ page }) => {
      await jet.locator('#jet-accordion').getByText('How long does a transfer take?', { exact: true }).click();
      const head = section(page, 'accordion').getByRole('button', { name: 'How long does a transfer take?' });
      await expect(head).toHaveAttribute('aria-expanded', 'false');
      await head.click();
      await settle(jet);
      expect((await same(page, ['faq'])).faq).toEqual(['a']);
      await expect(head).toHaveAttribute('aria-expanded', 'true');
      for (const el of [jet.locator('#jet-accordion'), section(page, 'accordion')]) { await expect(el.getByText('Same day inside the bank', { exact: false })).toBeVisible(); }
    });

    for (const [id, labels, current] of [['stepper', ['Details', 'Review', 'Done'], 'Review'], ['payment-status', ['Initiated', 'Approved', 'Sent', 'Completed'], 'Sent'],
      ['kyc-steps', ['ID', 'Selfie', 'Address'], 'Selfie']] as const) {
      test(`${id} · the same steps in order, the selected one current`, async ({ page }) => {
        await inOrder(jet.locator(`#jet-${id}`), labels);
        expect(await jet.evaluate((el) => (document.getElementById(el) as unknown as { selectedStep: string }).selectedStep, `jet-${id}`)).toBe(current);
        await inOrder(section(page, id), labels);
        // React Native announces the steps as one progress bar: "Step 2 of 3: Review"
        const at = labels.indexOf(current as never) + 1;
        await expect(section(page, id).getByRole('progressbar')).toHaveAccessibleName(new RegExp(`, Step ${at} of ${labels.length}: ${current}$`));
      });
    }

    test('side-nav · the selection written back, the current page marked', async ({ page }) => {
      await jet.locator('#jet-side-nav').getByText('Payments', { exact: true }).click();
      await settle(jet);
      const open = async () => { await section(page, 'side-nav').getByRole('button', { name: 'Menu' }).click(); return page.getByRole('dialog', { name: 'Main' }); };
      let drawer = await open();
      await expect(drawer.getByRole('button', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
      await drawer.getByRole('button', { name: 'Payments' }).click();
      await expect(drawer).toHaveCount(0);
      expect((await same(page, ['nav'])).nav).toBe('Payments');
      drawer = await open();
      await expect(drawer.getByRole('button', { name: 'Payments' })).toHaveAttribute('aria-current', 'page');
      await expect(drawer.locator('[aria-current="page"]')).toHaveCount(1);
    });

    test('sheet · a modal with its heading; Escape closes it and tells the screen once', async ({ page }) => {
      await jet.locator('#jet-sheet-opener').focus();
      await jet.evaluate(() => (document.getElementById('jet-sheet') as unknown as { open: (launcher: string) => void }).open('#jet-sheet-opener'));
      // The stock JET popup is the reference for what shows; Escape closing it is required of the pack below
      await expect(jet.locator('#jet-sheet').getByText('Choose what to show.', { exact: true })).toBeVisible();
      await jet.evaluate(() => (document.getElementById('jet-sheet') as unknown as { close: () => void }).close());
      // JET 21 fires ojClose after its close animation
      await expect.poll(async () => (await jetState(jet)).sheetCloses).toBe(1);
      await section(page, 'sheet').getByRole('button', { name: 'Filter' }).click();
      const sheet = page.getByRole('dialog', { name: 'Filter transactions' });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('heading', { name: 'Filter transactions' })).toHaveCount(1);
      await expect(sheet.getByText('Choose what to show.')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      expect((await same(page, ['sheetOpen', 'sheetCloses'])).sheetCloses).toBe(1);
    });

    test('pagination · the next page written back', async ({ page }) => {
      expect((await same(page, ['page'])).page).toBe(1);
      await jet.locator('#jet-pagination').getByRole('button', { name: 'Next Page', exact: true }).click();
      await section(page, 'pagination').getByRole('button', { name: 'Next page' }).click();
      await settle(jet);
      expect((await same(page, ['page'])).page).toBe(2);
      await expect(section(page, 'pagination').getByRole('button', { name: 'Page 2 of 4' })).toHaveAttribute('aria-pressed', 'true');
    });

    test('tooltip · the note shown from the term, hidden by Escape', async ({ page }) => {
      const note = 'What you can spend now: the balance less holds and pending card payments.';
      await jet.locator('#jet-tooltip-term').focus();
      await jet.evaluate(() => (document.getElementById('jet-tooltip') as unknown as { open: (launcher: string) => void }).open('#jet-tooltip-term'));
      await expect(jet.locator('#jet-tooltip').getByText(note)).toBeVisible();
      // A phone has no hover: the term's button opens the note. A stock oj-popup stays open on Escape; the pack must close (WCAG 1.4.13)
      await section(page, 'tooltip').getByRole('button', { name: 'About Available balance' }).click();
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

    test('account-picker · the value chosen from the sheet', async ({ page }) => {
      await setJet(jet, 'jet-account-picker', 'C');
      await choose(page, 'ap1', 'Current ·· 0187');
      expect((await same(page, ['fromAccount'])).fromAccount).toBe('C');
    });

    test('iban · a valid IBAN written back; one that fails the checksum not written, with a message', async ({ page }) => {
      await type(jet, jet.locator('#jet-iban input').first(), 'GB82WEST12345698765432');
      await type(page, input(page, 'ib1'), 'GB82 WEST 1234 5698 7654 32');
      expect((await same(page, ['iban'])).iban).toBe('GB82WEST12345698765432');
      await type(jet, jet.locator('#jet-iban input').first(), 'GB28NWBK60161331926819');
      await type(page, input(page, 'ib1'), 'GB28NWBK60161331926819');
      expect((await same(page, ['iban'])).iban).toBe('GB82WEST12345698765432');
      expect((await jetState(jet)).ibanValid).toBe('invalidShown');
      expect(await showsError(field(page, 'ib1'), input(page, 'ib1'))).toBe(true);
    });

    for (const [id, testID, names, pick, key, value] of [['payee-list', 'pl', ['A. Rao', 'J. Mehta'], 'J. Mehta', 'payeePicked', 'p2'],
      ['transaction-list', 'tl', ['Coffee House', 'Salary', 'Electricity'], 'Salary', 'txPicked', 't2']] as const) {
      test(`${id} · the same rows in order, the one picked written back`, async ({ page }) => {
        await inOrder(jet.locator(`#jet-${id}`), names);
        await jet.locator(`#jet-${id}`).getByText(pick, { exact: true }).first().click();
        await settle(jet);
        await inOrder(field(page, testID), names);
        // Each row is a control named by its text: payees are radios, transactions buttons
        await field(page, testID).getByRole(id === 'payee-list' ? 'radio' : 'button', { name: new RegExp(`^${pick},`) }).click();
        await settle(page);
        expect((await same(page, [key]))[key]).toBe(value);
      });
    }

    test('otp · the code written back, and the required message when cleared', async ({ page }) => {
      await type(jet, jet.locator('#jet-otp input').first(), '123456');
      await type(page, input(page, 'ot1'), '123456');
      expect((await same(page, ['otp'])).otp).toBe('123456');
      await expect(input(page, 'ot1')).toHaveAccessibleName(/^Enter the code/);
      await type(jet, jet.locator('#jet-otp input').first(), '');
      await type(page, input(page, 'ot1'), '');
      expect((await jetState(jet)).otpValid).toBe('invalidShown');
      expect(await showsError(field(page, 'ot1'), input(page, 'ot1'))).toBe(true);
    });

    test('session-timeout · a modal named by its title; Stay signed in closes it and tells the screen', async ({ page }) => {
      await jet.evaluate(() => (document.getElementById('jet-session-timeout') as unknown as { open: () => void }).open());
      const jetDialog = jet.getByRole('dialog', { name: 'Are you still there?' });
      await expect(jetDialog).toBeVisible();
      await jetDialog.getByRole('button', { name: 'Stay signed in' }).click();
      await expect.poll(async () => (await jetState(jet)).timeoutOpen).toBe(false);
      await section(page, 'session-timeout').getByRole('button', { name: 'Show the warning' }).click();
      const dialog = page.getByRole('dialog', { name: 'Are you still there?' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Sign out' })).toHaveCount(1);
      await dialog.getByRole('button', { name: 'Stay signed in' }).click();
      await expect(dialog).toHaveCount(0);
      expect((await same(page, ['timeoutOpen', 'timeoutActions'])).timeoutActions).toEqual(['stay']);
    });

    test('sensitive · masked until shown, then the same number as the JET field', async ({ page }) => {
      const full = await jet.evaluate(() => (document.getElementById('jet-sensitive') as unknown as { value: string }).value);
      const sf = field(page, 'sf1');
      await expect(sf.getByText(full)).toHaveCount(0);
      await expect(sf.getByText('4821', { exact: false })).toBeVisible();
      await sf.getByRole('button', { name: 'Show Card number' }).click();
      await expect(sf.getByText(full)).toBeVisible();
    });

    test('spending-chart · the same months and figures as oj-chart', async ({ page }) => {
      const jetBars = await jet.evaluate(async () => {
        const c = document.getElementById('jet-spending-chart') as unknown as { getDataItem: (s: number, g: number) => { group: unknown; value: number } | null };
        for (let i = 0; i < 50 && !(c.getDataItem && c.getDataItem(0, 4)); i++) { await new Promise((r) => setTimeout(r, 100)); }
        return [0, 1, 2, 3, 4].map((g) => { const d = c.getDataItem(0, g); return d ? { label: String(d.group), value: Number(d.value) } : null; });
      });
      // Each bar is a button named by its month and amount
      const names = await section(page, 'spending-chart').getByRole('button').evaluateAll((list) => list.map((b) => b.getAttribute('aria-label') || ''));
      const bars = names.map((n) => { const [label, amount] = n.split(', '); return { label, value: Number(amount.replace(/[^\d.-]/g, '')) }; });
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
