// Rasterize the app icons from their SVG sources into the PNG and ICO files Windows and Electron
// use. Run after changing assets/icons/*.svg; the outputs are committed so builds need no browser.
//   node scripts/build-icons.cjs
// Uses the system Chrome through Playwright, like the smoke scripts. The ICO holds PNG-compressed
// images at every standard size.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const dir = path.resolve(__dirname, "..", "assets", "icons");
const sizes = [16, 24, 32, 48, 64, 128, 256];

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = [], blobs = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); entry.writeUInt8(0, 3); entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(offset, 12);
    entries.push(entry); blobs.push(png); offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const name of ["icon", "icon-dev"]) {
      const svg = fs.readFileSync(path.join(dir, `${name}.svg`), "utf8"), pngs = [];
      for (const size of sizes) {
        const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
        await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
        pngs.push({ size, png: await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }) });
        await page.close();
      }
      fs.writeFileSync(path.join(dir, `${name}.png`), pngs.at(-1).png);
      fs.writeFileSync(path.join(dir, `${name}.ico`), ico(pngs));
      console.log(`${name}: ${sizes.join("/")} px → ${name}.png (256) and ${name}.ico (${pngs.reduce((n, p) => n + p.png.length, 0)} bytes)`);
    }
  } finally { await browser.close(); }
})();
