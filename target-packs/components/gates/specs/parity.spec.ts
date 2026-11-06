import { Locator, Page, expect, test } from '@playwright/test';

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

    // ---------- Groups 1 to 4: the rest of the components that replace a JET element ----------
    const button = (page: Page, id: string, name: string) => async (side: Side) => { await page.locator(`#${side}-${id}`).getByRole('button', { name }).click(); };
    const clickText = (page: Page, id: string, text: string) => async (side: Side) => { await page.locator(`#${side}-${id}`).getByText(text, { exact: true }).first().click(); };
    /** The labels appear in this order in the element's text. */
    const inOrder = async (el: Locator, labels: string[]) => {
      const text = await el.innerText();
      const at = labels.map((l) => text.indexOf(l));
      expect(at.every((p) => p >= 0), `${labels.join(', ')} all shown`).toBe(true);
      expect(at, 'in the same order').toEqual([...at].sort((a, b) => a - b));
    };
    const shownOnce = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true });

    for (const [id, name, key] of [['secondary-button', 'Save for later', 'secondaryPresses'], ['danger-button', 'Cancel payment', 'dangerPresses']]) {
      test(`${id} · named by its label, on-oj-action`, async ({ page }) => {
        for (const side of ['jet', 'bx']) { await expect(page.locator(`#${side}-${id}`).getByRole('button', { name })).toHaveCount(1); }
        const s = await both(page, button(page, id, name), [key]);
        expect(s.bx[key]).toBe(1);
      });
    }

    for (const [id, key, from, to] of [['segmented', 'show', 'Day', 'Week'], ['repeat', 'repeat', 'Once', 'Monthly']]) {
      test(`${id} · one value, picked by its label`, async ({ page }) => {
        expect((await state(page)).bx[key]).toBe(from);
        const s = await both(page, clickText(page, id, to), [key]);
        expect(s.bx[key]).toBe(to);
        await expect(page.locator(`#bx-${id}`).getByRole('radio', { name: to })).toHaveAttribute('aria-checked', 'true');
      });
    }

    test('action-menu · the chosen action\'s value in ojAction, and the menu closes', async ({ page }) => {
      const s = await both(page, async (side) => {
        await page.locator(`#${side}-action-menu`).getByRole('button', { name: 'Account actions' }).click();
        await page.getByRole('menuitem', { name: 'Set a nickname' }).click();
      }, ['menuPicked']);
      expect(s.bx.menuPicked).toBe('nickname');
      await expect(page.getByRole('menuitem', { name: 'Set a nickname' })).toHaveCount(0);
    });

    test('accordion · expanded written back, the body shown', async ({ page }) => {
      expect((await state(page)).bx.faq).toEqual([]);
      const s = await both(page, clickText(page, 'accordion', 'How long does a transfer take?'), ['faq']);
      expect(s.bx.faq).toEqual(['a']);
      for (const side of ['jet', 'bx']) { await expect(page.locator(`#${side}-accordion`).getByText('Same day inside the bank', { exact: false })).toBeVisible(); }
    });

    for (const [id, labels, current] of [['stepper', ['Details', 'Review', 'Done'], 'Review'], ['payment-status', ['Initiated', 'Approved', 'Sent', 'Completed'], 'Sent'],
      ['kyc-steps', ['ID', 'Selfie', 'Address'], 'Selfie']] as const) {
      test(`${id} · the same steps in order, the selected one current`, async ({ page }) => {
        for (const side of ['jet', 'bx']) { await inOrder(page.locator(`#${side}-${id}`), [...labels]); }
        const selected = await page.evaluate((el) => (document.getElementById(el) as unknown as { selectedStep: string }).selectedStep, `jet-${id}`);
        expect(selected).toBe(current);
        await expect(page.locator(`#bx-${id} [aria-current="step"]`)).toContainText(current);
      });
    }

    test('side-nav · selection written back', async ({ page }) => {
      const s = await both(page, clickText(page, 'side-nav', 'Payments'), ['nav']);
      expect(s.bx.nav).toBe('Payments');
      await expect(page.locator('#bx-side-nav').getByRole('button', { name: 'Payments' })).toHaveAttribute('aria-current', 'page');
    });

    test('sheet · a modal with its heading; Escape closes it and fires ojClose', async ({ page }) => {
      for (const side of ['jet', 'bx']) {
        if (side === 'jet') {
          await page.locator('#jet-sheet-opener').focus();
          await page.evaluate(() => (document.getElementById('jet-sheet') as unknown as { open: (launcher: string) => void }).open('#jet-sheet-opener'));
        } else {
          await page.evaluate(() => { (document.getElementById('bx-sheet') as unknown as { open: boolean }).open = true; });
        }
        await page.waitForTimeout(400);
        await expect(shownOnce(page, 'Choose what to show.')).toHaveCount(1);
        await expect(shownOnce(page, 'Filter transactions')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await expect(shownOnce(page, 'Choose what to show.')).toHaveCount(0);
      }
      await expect(page.locator('#bx-sheet').getByRole('dialog', { name: 'Filter transactions' })).toHaveCount(0);
      const s = await state(page);
      expect(s.bx.sheetOpen).toBe(s.jet.sheetOpen);
      expect(s.bx.sheetCloses).toBe(s.jet.sheetCloses);
      expect(s.bx.sheetCloses).toBe(1);
    });

    test('pagination · the next page written back', async ({ page }) => {
      expect((await state(page)).jet.page).toBe(1);
      const s = await both(page, async (side) => {
        await (side === 'jet' ? page.locator('#jet-pagination .oj-pagingcontrol-nav-next') : page.locator('#bx-pagination').getByRole('button', { name: 'Next page' })).click();
      }, ['page']);
      expect(s.bx.page).toBe(2);
    });

    test('tooltip · the note shown with focus on the term, hidden by Escape', async ({ page }) => {
      const note = 'What you can spend now: the balance less holds and pending card payments.';
      for (const side of ['jet', 'bx']) {
        if (side === 'jet') {
          await page.locator('#jet-tooltip-term').focus();
          await page.evaluate(() => (document.getElementById('jet-tooltip') as unknown as { open: (launcher: string) => void }).open('#jet-tooltip-term'));
        } else {
          await page.locator('#bx-tooltip').getByRole('button', { name: 'About Available balance' }).focus();
        }
        await expect(page.locator(`#${side}-tooltip`).getByText(note)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator(`#${side}-tooltip`).getByText(note)).toBeHidden();
      }
      await expect(page.locator('#bx-tooltip').getByRole('tooltip', { includeHidden: true })).toHaveCount(1);
    });

    for (const [id, text, role] of [['alert-banner', 'Transfers after 6 pm arrive the next working day.', 'status'],
      ['error-message', 'The amount is more than your daily limit of 5,000.00.', 'alert'], ['success-message', 'Payment sent. Reference FX-20391.', 'status']] as const) {
      test(`${id} · the same message shown`, async ({ page }) => {
        for (const side of ['jet', 'bx']) { await expect(page.locator(`#${side}-${id}`).getByText(text)).toBeVisible(); }
        await expect(page.locator(`#bx-${id}`).getByRole(role)).toContainText(text);
      });
    }

    test('account-picker · value', async ({ page }) => {
      const s = await both(page, async (side) => {
        if (side === 'jet') { await page.evaluate(() => { (document.getElementById('jet-account-picker') as unknown as { value: string }).value = 'C'; }); } else { await page.locator('#bx-account-picker select').selectOption('C'); }
      }, ['fromAccount']);
      expect(s.bx.fromAccount).toBe('C');
    });

    test('iban · a valid IBAN written back; one that fails the checksum is not, and the message shows', async ({ page }) => {
      await both(page, typed(page, 'iban', 'GB29NWBK60161331926819'), ['iban', 'ibanValid']);
      const s = await both(page, typed(page, 'iban', 'GB28NWBK60161331926819'), ['iban', 'ibanValid']);
      expect(s.bx.iban).toBe('GB29NWBK60161331926819');
      expect(s.bx.ibanValid).toBe('invalidShown');
      await expect(page.locator('#bx-iban').getByRole('alert')).toBeVisible();
    });

    for (const [id, names, pick, key, value] of [['payee-list', ['A. Rao', 'J. Mehta'], 'J. Mehta', 'payeePicked', 'p2'],
      ['transaction-list', ['Coffee House', 'Salary', 'Electricity'], 'Salary', 'txPicked', 't2']] as const) {
      test(`${id} · the same rows, and the screen told which one was picked`, async ({ page }) => {
        for (const side of ['jet', 'bx']) { await inOrder(page.locator(`#${side}-${id}`), [...names]); }
        const s = await both(page, clickText(page, id, pick), [key]);
        expect(s.bx[key]).toBe(value);
      });
    }

    test('otp · the code written back, and the required message when cleared', async ({ page }) => {
      const s = await both(page, typed(page, 'otp', '123456'), ['otp', 'otpValid']);
      expect(s.bx.otp).toBe('123456');
      // A cleared required JET field may keep its last value, so only valid is compared
      const t = await both(page, typed(page, 'otp', ''), ['otpValid']);
      expect(t.bx.otpValid).toBe('invalidShown');
    });

    test('session-timeout · a modal named by its title; Stay signed in closes it and tells the screen', async ({ page }) => {
      for (const side of ['jet', 'bx']) {
        await page.evaluate((el) => {
          const d = document.getElementById(el) as unknown as { open: (() => void) | boolean };
          if (el.startsWith('jet')) { (d.open as () => void)(); } else { d.open = true; }
        }, `${side}-session-timeout`);
        const dialog = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: 'Are you still there?' }).filter({ visible: true });
        await expect(dialog).toHaveCount(1);
        await expect(dialog).toHaveAccessibleName('Are you still there?');
        await expect(dialog.getByRole('button', { name: 'Sign out' })).toHaveCount(1);
        await dialog.getByRole('button', { name: 'Stay signed in' }).click();
        await expect(dialog).toHaveCount(0);
      }
      await expect.poll(async () => (await state(page)).jet.timeoutOpen).toBe(false);
      const s = await state(page);
      expect(s.bx.timeoutOpen).toBe(false);
      expect(s.bx.timeoutActions).toEqual(s.jet.timeoutActions);
      expect(s.bx.timeoutActions).toEqual(['stay']);
    });

    test('sensitive · named by its label; masked until shown, then the same number as the JET field', async ({ page }) => {
      const full = await page.evaluate(() => (document.getElementById('jet-sensitive') as unknown as { value: string }).value);
      const bx = page.locator('#bx-sensitive');
      await expect(bx.getByRole('group', { name: 'Card number' })).toHaveCount(1);
      await expect(bx.getByText(full)).toHaveCount(0);
      await expect(bx.getByText('4821', { exact: false })).toBeVisible();
      await bx.getByRole('button', { name: 'Show Card number' }).click();
      await expect(bx.getByText(full)).toBeVisible();
    });

    test('spending-chart · the same months and figures as oj-chart', async ({ page }) => {
      const jetBars = await page.evaluate(async () => {
        const c = document.getElementById('jet-spending-chart') as unknown as { getDataItem: (s: number, g: number) => { group: unknown; value: number } | null };
        for (let i = 0; i < 50 && !(c.getDataItem && c.getDataItem(0, 4)); i++) { await new Promise((r) => setTimeout(r, 100)); }
        return [0, 1, 2, 3, 4].map((g) => { const d = c.getDataItem(0, g); return d ? { label: String(d.group), value: Number(d.value) } : null; });
      });
      const bxBars = await page.locator('#bx-spending-chart .bx-bar').evaluateAll((bars) => bars.map((b) => ({
        label: (b.querySelector('.bx-bar-label')?.textContent || '').trim(), value: Number((b.querySelector('.bx-bar-value')?.textContent || '').replace(/[^\d.-]/g, '')) })));
      expect(bxBars).toEqual(jetBars);
      expect(bxBars[0]).toEqual({ label: 'Aug', value: 1240 });
    });

    test('budget-progress · a progressbar with the same name, value and maximum', async ({ page }) => {
      const bar = (side: Side) => page.locator(`[data-parity="budget-progress"] [data-side="${side}"]`).getByRole('progressbar').first();
      for (const attr of ['aria-valuenow', 'aria-valuemax']) {
        expect(Number(await bar('bx').getAttribute(attr)), attr).toBe(Number(await bar('jet').getAttribute(attr)));
      }
      expect(Number(await bar('bx').getAttribute('aria-valuenow'))).toBe(320);
      for (const side of ['jet', 'bx'] as const) { await expect(bar(side)).toHaveAccessibleName('Groceries'); }
    });
  });
}
