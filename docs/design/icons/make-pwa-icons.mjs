// Renders the app icons from the game logo sources (docs/design/logo/game-icon.svg and
// game-favicon.svg, made by game_logo.py) with headless Chrome, so they stay sharp at every size.
// Re-run after changing the icon:
//
//   node docs/design/icons/make-pwa-icons.mjs            (from the repo root)
//   CHROME="/path/to/chrome" node docs/design/icons/...   (if Chrome isn't in the default place)
//
// Writes web/public/:
//   icons/icon-192.png, icons/icon-512.png   PWA "any" icons (full-bleed square art)
//   icons/icon-maskable-512.png              PWA "maskable": the cards sit inside the 80% safe zone already
//   apple-touch-icon.png                     iPhone Home Screen (180 px; iOS rounds the corners itself)
//   favicon-16.png, favicon-32.png, favicon.ico (16/32/48)   browser tabs, from the simplified favicon art
//   logo.svg                                 the full game logo (sign-in screen)
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const logoDir = join(root, 'docs', 'design', 'logo');
const pub = join(root, 'web', 'public');

const ICONS = [
    { file: 'icons/icon-192.png', size: 192, src: 'game-icon.svg' },
    { file: 'icons/icon-512.png', size: 512, src: 'game-icon.svg' },
    { file: 'icons/icon-maskable-512.png', size: 512, src: 'game-icon.svg' },
    { file: 'apple-touch-icon.png', size: 180, src: 'game-icon.svg' },
    { file: 'favicon-16.png', size: 16, src: 'game-favicon.svg' },
    { file: 'favicon-32.png', size: 32, src: 'game-favicon.svg' },
    { file: null, size: 48, src: 'game-favicon.svg' } // only inside favicon.ico
];

const chrome = process.env.CHROME ?? {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}[process.platform] ?? 'google-chrome';

const dataUrl = (name) => `data:image/svg+xml;base64,${readFileSync(join(logoDir, name)).toString('base64')}`;

// An .ico file is a small header plus PNGs stored as they are.
function ico (pngs)
{
    const head = Buffer.alloc(6 + 16 * pngs.length);
    head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
    let offset = head.length;
    pngs.forEach(({ size, data }, i) =>
    {
        const e = 6 + 16 * i;
        head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
        head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
        head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12);
        offset += data.length;
    });
    return Buffer.concat([head, ...pngs.map(p => p.data)]);
}

const port = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'icons-'));
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

try
{
    let targets = [];
    for (let i = 0; i < 100 && !targets.some(t => t.type === 'page'); i++)
    {
        try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
    }
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

    mkdirSync(join(pub, 'icons'), { recursive: true });
    const icoPngs = [];
    for (const icon of ICONS)
    {
        const html = `<!doctype html><html><body style="margin:0;background:transparent">`
            + `<img src="${dataUrl(icon.src)}" width="${icon.size}" height="${icon.size}" style="display:block"></body></html>`;
        await send('Emulation.setDeviceMetricsOverride', { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
        await sleep(400);
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 } });
        const data = Buffer.from(shot.result.data, 'base64');
        if (icon.src === 'game-favicon.svg') icoPngs.push({ size: icon.size, data });
        if (icon.file)
        {
            writeFileSync(join(pub, icon.file), data);
            console.log(`wrote web/public/${icon.file} (${icon.size}px)`);
        }
    }
    writeFileSync(join(pub, 'favicon.ico'), ico(icoPngs));
    console.log('wrote web/public/favicon.ico (16, 32, 48)');
    copyFileSync(join(logoDir, 'game-logo.svg'), join(pub, 'logo.svg'));
    console.log('wrote web/public/logo.svg');
    ws.close();
}
finally
{
    proc.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
}
