import { readFileSync } from 'node:fs';
import { Page, expect, test } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

/** The foundation set every pack shows in its gallery, as <section data-component="id">. */
export const FOUNDATION = ['button', 'icon-button', 'text-field', 'amount', 'select', 'checkbox-group', 'choice-group', 'date', 'dialog', 'toast', 'card',
  'tabs', 'data-grid'] as const;

/** The forms wave (0.2.0), in the galleries of the packs that have it. */
export const FORMS = ['text-area', 'password', 'number-input', 'currency-picker', 'multi-select', 'switch', 'date-range', 'search', 'autocomplete',
  'document-upload'] as const;

/** Group 1 of the catalogue, in the galleries of the web packs. */
export const G1 = ["secondary-button","danger-button","savings-slider","segmented","filter-chips","action-menu","accordion","stepper","breadcrumb","side-nav","sheet","grid","divider","avatar","pagination","status-badge","timeline","spinner","skeleton","empty-state","tooltip","alert-banner","error-message","success-message","notification-panel"] as const;

/** Group 2 of the catalogue, in the galleries of the web packs. */
export const G2 = ["account-picker","account-summary","balance-card","account-card","account-details","iban","quick-actions","payee-list","beneficiary-card","payment-form","transfer-summary","payment-status","transaction-list","transaction-filter","transaction-details","repeat","receipt","upcoming-bills","td-summary","new-td","maturity-instructions","td-topup","td-redemption"] as const;

/** Group 3 of the catalogue, in the galleries of the web packs. */
export const G3 = ["loan-summary","loan-repayment","loan-schedule","promise-to-pay","disbursement","card-tile","card-list","activate-card","convert-emi","redeem-points","spend-limit","card-controls","block-card","reset-pin","raise-dispute","add-on-card","card-statements","otp","biometric","session-timeout","secure-confirmation","sensitive","kyc-steps","fraud-alert"] as const;

/** Group 4 of the catalogue, in the galleries of the web packs. */
export const G4 = ["spending-chart","budget-progress","savings-goal","spend-categories","approval-queue","approval-detail","approval-journey","reroute","modification-requested","pending-release","structure-type","account-structure","structure-simulation","intercompany-limits","sweep-monitor","profile","sign-in-options","otp-delivery","devices","appearance","language","alerts-subscription","do-not-disturb","consents","transaction-limits","session-summary"] as const;

/** Group 5 of the catalogue, in the galleries of the web packs. */
export const G5 = ["raise-request","track-requests","mailbox","compose-mail","e-receipts","certificates","statement-request","statement-format","self-register","fatca-crs","product-showcase","application-tracker","terms-consent","loan-calculator","eligibility-calculator","td-calculator","currency-converter","goal-calculator","locator","live-chat","feedback","nominations","faq"] as const;

/** Group 6 of the catalogue, in the galleries of the web packs. */
export const G6 = ["overview","quick-insights","recent-transactions","bills-widget","spend-analysis","goals","budgets","calculators","credit-score","rewards","financial-advisor","special-offers","credit-cards-overview","loans-overview","delinquency-notice","financial-overview","position-by-currency","credit-line-usage","bills-receivable-payable","trade-instruments","reports","accounts-corp","corporate-limits","transactions-widget","last-5-payments","bulk-file-upload","quick-links-corp","work-snapshot","notifications-widget","pending-for-action","my-limits","pending-approvals"] as const;

/** Group 7 of the catalogue, in the galleries of the web packs. */
export const G7 = ["rolling-digits","count-up","split-flap-board","reveal-digits","blur-in-text","text-reveal","rotating-text","shimmer-text","gradient-text","typed-text","focus-word","scroll-float-text","fade-in-content","scroll-reveal","scroll-expand","edge-blur","glare-hover","magnetic-button","highlight-border","click-burst","marquee","animated-list","spotlight-card","tilt-card","flip-card","card-stack","glow-border-card","bento-grid","carousel","elastic-slider","option-wheel","pill-nav","dock-nav","card-nav","staggered-menu","document-folder","scroll-stack","profile-card","glass-panel","gradient-backdrop","soft-aurora","silk-backdrop","dot-grid","line-waves","light-beams","topography","particle-backdrop","slide-to-confirm","hold-to-confirm","otp-slots","receipt-tear","success-check","swipe-row","swipe-toast","bell-toggle","squish-switch","jelly-radio","glide-select","rubber-segment","scrub-field","budget-gauge","status-mark","favourite-heart","peek-rating","warm-tooltip","prompt-bar","voice-pill","call-chip","lattice-loader"] as const;

export const VIEWPORTS = { phone: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 }, laptop: { width: 1280, height: 800 } } as const;
export const THEMES = ['light', 'dark'] as const;

/** Opens a pack's gallery in a theme and waits until every section is drawn. */
export async function openGallery(page: Page, url: string, theme: string, query = '') {
  await page.goto(`${url}?mode=${theme}${query ? '&' + query : ''}`);
  await page.waitForSelector('[data-gallery-ready]', { timeout: 30_000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  // Motion off so screenshots are stable (the skin honours reduced motion)
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme === 'dark' ? 'dark' : 'light' });
}

/** axe on one section with every rule, colour contrast included (the real browser lays out and paints). */
export async function axe(page: Page, selector: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) { await page.addScriptTag({ path: AXE }); }
  return page.evaluate(async (sel) => {
    const w = window as unknown as { axe: { run: (n: Element, o: object) => Promise<{ violations: { id: string; help: string; nodes: { target: string[]; failureSummary?: string }[] }[] }> } };
    const r = await w.axe.run(document.querySelector(sel)!, { rules: { region: { enabled: false } } });
    return r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ') + (n.failureSummary ? ` (${n.failureSummary.split('\n').slice(1).join(' ').trim()})` : '')).join('; ')}`);
  }, selector);
}

/** Overflow and touch targets in one section: nothing wider than the section, every control at least 24 by 24 (WCAG 2.5.8). */
export async function layout(page: Page, selector: string, phone: boolean): Promise<string[]> {
  return page.evaluate(({ sel, phone }) => {
    const out: string[] = [];
    const section = document.querySelector(sel) as HTMLElement;
    const box = section.getBoundingClientRect();
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) { out.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px)`); }
    section.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || getComputedStyle(el).position === 'fixed') { return; }
      // Inside a scroll container (a wide table) is fine; the container itself must fit
      let p = el.parentElement;
      while (p && p !== section) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX)) { return; } p = p.parentElement; }
      if (r.right > box.right + 1) { out.push(`${el.tagName.toLowerCase()}.${el.className} ends ${Math.round(r.right - box.right)}px past the section`); }
    });
    if (phone) {
      section.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], select, input:not([type="checkbox"]):not([type="radio"]):not(.bx-visually-hidden), a[href], label.bx-choice')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && (r.width < 24 || r.height < 24)) { out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" is ${Math.round(r.width)}x${Math.round(r.height)}`); }
        });
    }
    return [...new Set(out)].slice(0, 10);
  }, { sel: selector, phone });
}

/** The computed colours of every part of a section, to prove the dark theme changes the component (not only the page). */
export async function colours(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const parts = document.querySelector(sel)!.querySelectorAll<HTMLElement>('.gate-body *');
    return Array.from(parts).map((el) => { const s = getComputedStyle(el); return `${s.backgroundColor} ${s.color} ${s.borderTopColor}`; }).join('|');
  }, selector);
}

/**
 * The gates for one pack's gallery: per component, accessibility (light), themes (dark: contrast holds and the
 * colours change), responsive (phone, tablet, laptop) and a visual snapshot per theme.
 */
/** The catalogue's name for each component per pack; a component a pack has no name for is not built there. */
const CATALOGUE = JSON.parse(readFileSync(new URL('../../catalogue.json', import.meta.url), 'utf8')) as { categories: { components: { id: string; names?: Record<string, string> }[] }[] };
const NAMED = new Map(CATALOGUE.categories.flatMap((c) => c.components).map((e) => [e.id, e.names || {}]));
const PACK_OF: Record<string, string> = { jet6: 'jet-premium', jet21: 'jet-premium', react: 'react', angular: 'angular' };

export function packGates(pack: string, url: string, components: readonly string[] = FOUNDATION, query = '') {
  const inPack = components.filter((id) => !NAMED.has(id) || !!NAMED.get(id)![PACK_OF[pack] || pack]);
  test.describe(pack, () => {
    for (const id of inPack) {
      const sel = `[data-component="${id}"]`;
      test(`${id} · accessibility`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS.laptop);
        await openGallery(page, url, 'light', query);
        expect(await axe(page, sel)).toEqual([]);
      });
      test(`${id} · themes`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS.laptop);
        await openGallery(page, url, 'light', query);
        const light = await colours(page, sel);
        await openGallery(page, url, 'dark', query);
        expect(await axe(page, sel)).toEqual([]);
        expect(await colours(page, sel)).not.toBe(light);
      });
      test(`${id} · responsive`, async ({ page }) => {
        for (const [name, size] of Object.entries(VIEWPORTS)) {
          await page.setViewportSize(size);
          await openGallery(page, url, 'light', query);
          expect(await layout(page, sel, name === 'phone'), name).toEqual([]);
        }
      });
      test(`${id} · visual`, async ({ page }) => {
        for (const theme of THEMES) {
          await page.setViewportSize(VIEWPORTS.laptop);
          await openGallery(page, url, theme, query);
          await expect(page.locator(sel)).toHaveScreenshot(`${pack}-${id}-${theme}.png`, { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 });
        }
      });
    }
  });
}
