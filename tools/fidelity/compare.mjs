// Puts an approved board and the built page side by side with a difference heatmap, and scores how much differs.
//   node tools/fidelity/compare.mjs [Board ...]   (default: every board with a built screenshot in target/fidelity)
// Output: target/fidelity/<Board>-<width>-<theme>-compare.png, and target/fidelity/report.json with the share of
// pixels that differ per board. The share is a guide only: the boards' numbers are examples, so data differs; the
// side-by-side review decides.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = await import(pathToFileURL(path.join(root, 'target-packs/components/gates/node_modules/playwright/index.mjs')).href);
const boards = path.join(root, 'docs/design/boards');
const out = path.join(root, 'target/fidelity');
const built = fs.readdirSync(out).filter((f) => f.endsWith('-built.png'));
const wanted = process.argv.slice(2);
const pairs = built.map((f) => f.replace('-built.png', '')).filter((k) => !wanted.length || wanted.includes(k.split('-')[0]))
  .filter((k) => fs.existsSync(path.join(boards, k + '.png')));
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

const browser = await chromium.launch({ args: ['--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const report = {};
for (const key of pairs) {
  const result = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width);
    const h = Math.max(ia.height, ib.height);
    const pixels = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
    const pa = pixels(ia);
    const pb = pixels(ib);
    const diff = new ImageData(w, h);
    let changed = 0;
    for (let p = 0; p < pa.data.length; p += 4) {
      const d = Math.abs(pa.data[p] - pb.data[p]) + Math.abs(pa.data[p + 1] - pb.data[p + 1]) + Math.abs(pa.data[p + 2] - pb.data[p + 2]);
      const hot = d > 60;
      if (hot) { changed += 1; }
      const g = (pa.data[p] + pa.data[p + 1] + pa.data[p + 2]) / 3;
      diff.data[p] = hot ? 230 : g * 0.25 + 190;
      diff.data[p + 1] = hot ? 40 : g * 0.25 + 190;
      diff.data[p + 2] = hot ? 60 : g * 0.25 + 190;
      diff.data[p + 3] = 255;
    }
    // Board | built | heatmap, scaled to one strip
    const gap = 24;
    const strip = new OffscreenCanvas(w * 3 + gap * 2, h + 40);
    const s = strip.getContext('2d');
    s.fillStyle = '#ffffff'; s.fillRect(0, 0, strip.width, strip.height);
    s.font = '600 22px sans-serif'; s.fillStyle = '#0f172a';
    s.fillText('Approved board', 8, 28); s.fillText('Built page', w + gap + 8, 28); s.fillText('Differences (red)', (w + gap) * 2 + 8, 28);
    s.drawImage(ia, 0, 40); s.drawImage(ib, w + gap, 40);
    const dc = new OffscreenCanvas(w, h); dc.getContext('2d').putImageData(diff, 0, 0); s.drawImage(dc, (w + gap) * 2, 40);
    const blob = await strip.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 1) { bin += String.fromCharCode(buf[i]); }
    return { png: btoa(bin), share: changed / (w * h) };
  }, [uri(path.join(boards, key + '.png')), uri(path.join(out, key + '-built.png'))]);
  fs.writeFileSync(path.join(out, key + '-compare.png'), Buffer.from(result.png, 'base64'));
  report[key] = Math.round(result.share * 1000) / 10;
  console.log(key, report[key] + '% differs');
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1) + '\n');
await browser.close();
