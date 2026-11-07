// Screenshots the approved Modernization boards and the factory's built pages at the same sizes, for the side-by-side
// design check (docs/MODERNIZATION-PARALLEL-PLAN.md, Phase 0).
//   node tools/fidelity/shoot.mjs boards [Board ...]           every board (or the named ones) at 1440 and 1024, light and dark
//   node tools/fidelity/shoot.mjs pages <route=Board[@sheetId]> ... the factory's pages, signed in to FACTORY_URL (default 8081)
// Pages need FACTORY_USER (default admin) and FACTORY_PASSWORD in the environment; nothing secret is kept in the repository.
// Output: docs/design/boards/<Board>-<width>-<light|dark>.png and target/fidelity/<Board>-<width>-<theme>-built.png.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exampleRoutes } from './example-run.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = await import(pathToFileURL(path.join(root, 'target-packs/components/gates/node_modules/playwright/index.mjs')).href);
const src = path.join(root, 'docs/design/boards/src');
// support.js is the design tool's board runtime (not kept in the repository): read it from the canvas once, into src
if (process.argv[2] === 'boards' && !fs.existsSync(path.join(src, 'support.js'))) { throw new Error('Put the board runtime at docs/design/boards/src/support.js first (the canvas file artifact-type/dc-runtime.js).'); }
const [mode, ...args] = process.argv.slice(2);
const WIDTHS = [1440, 1024];
// Screens on the board; parts (Nav, Topbar, Steps) and overviews (Main, Actions, Phone, Tablet, DarkTheme) are not shot alone
const SCREENS = ['Landing', 'ChoosePath', 'Components', 'Mapping', 'UpgradePlan', 'Catalogue', 'Migrate', 'Workspace', 'Validation', 'Review',
  'Decisions', 'History', 'Packs', 'TechConfig', 'States', 'Charts'];

const browser = await chromium.launch({ args: ['--disable-gpu'] });
try {
  if (mode === 'boards') {
    const out = path.join(root, 'docs/design/boards');
    const server = http.createServer((req, res) => {
      const file = path.resolve(src, '.' + decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(src) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
      fs.createReadStream(file).pipe(res);
    }).listen(5199);
    for (const board of args.length ? args : SCREENS) {
      for (const theme of ['light', 'dark']) {
        const file = theme === 'dark' ? `${board}-dark.dc.html` : `${board}.dc.html`;
        if (!fs.existsSync(path.join(src, file))) { continue; }
        for (const width of WIDTHS) {
          const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
          await page.goto(`http://localhost:5199/${file}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(3000);
          await page.screenshot({ path: path.join(out, `${board}-${width}-${theme}.png`), fullPage: true });
          await page.close();
          console.log('board', board, width, theme);
        }
      }
    }
    server.close();
  } else if (mode === 'pages') {
    const example = args[0] === '--example';
    if (example) { args.shift(); if (!process.env.EXAMPLE_CHANGE) { throw new Error('Set EXAMPLE_CHANGE to a change id of the test factory'); } }
    const base = process.env.FACTORY_URL || 'http://localhost:8081';
    const password = process.env.FACTORY_PASSWORD;
    if (!password) { throw new Error('Set FACTORY_PASSWORD (and FACTORY_USER if not admin) to sign in to ' + base); }
    const out = path.join(root, 'target/fidelity');
    fs.mkdirSync(out, { recursive: true });
    for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: theme });
      const page = await context.newPage();
      if (example) {
        // The run pages get the example run (tools/fidelity/example-run.mjs) in place of the run endpoints, in this browser only
        // EXAMPLE_EMPTY=1 answers with no runs, for the empty states
        const routes = process.env.EXAMPLE_EMPTY ? [[/\/modernization\/(runs|history)$/, []]] : exampleRoutes(process.env.EXAMPLE_CHANGE);
        await page.route(/\/api\/workspaces\/[^?]*\/modernization\/(runs|history)/, (route) => {
          const url = new URL(route.request().url()).pathname;
          const hit = routes.find((r) => r[0].test(url));
          return hit && route.request().method() === 'GET' ? route.fulfill({ json: hit[1] }) : route.continue();
        });
      }
      await page.goto(base + '/', { waitUntil: 'networkidle' });
      await page.locator('#loginUsernameInput').fill(process.env.FACTORY_USER || 'admin');
      await page.locator('input[type=password]').first().fill(password);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);
      // The factory keeps its theme as a preference; the dark board compares with the factory's dark theme
      await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); }, theme);
      for (const pair of args) {
        // route=Board@sheetId opens that sheet or dialog first (a dialog has its own board)
        const [route, rest] = pair.split('=');
        const [board, sheet] = rest.split('@');
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`${base}/?ojr=${route}`, { waitUntil: 'networkidle' });
          await page.evaluate((t) => { document.documentElement.setAttribute('data-theme', t); }, theme);
          await page.waitForTimeout(2500);
          if (sheet) { await page.evaluate((id) => { document.getElementById(id).open = true; }, sheet); await page.waitForTimeout(1200); }
          await page.screenshot({ path: path.join(out, `${board}-${width}-${theme}-built.png`), fullPage: true });
          console.log('page', route, width, theme);
        }
      }
      await context.close();
    }
  } else {
    throw new Error('Use: shoot.mjs boards [Board ...] | shoot.mjs pages <route=Board> ...');
  }
} finally {
  await browser.close();
}
