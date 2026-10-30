// Renders the PWA manifest icons from the logo emblem (docs/design/logo/logo-emblem.svg)
// with headless Chrome, so they stay sharp at every size. Re-run after changing the emblem:
//
//   node docs/design/icons/make-pwa-icons.mjs            (from the repo root)
//   CHROME="/path/to/chrome" node docs/design/icons/...   (if Chrome isn't in the default place)
//
// Writes web/public/icons/:
//   icon-192.png, icon-512.png   "any" icons: emblem on the dark table colour, like apple-touch-icon.png
//   icon-maskable-512.png        "maskable": Android may crop it to a circle or squircle, so the
//                                emblem fits inside the 80% safe zone with background to the edges
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const out = join(root, 'web', 'public', 'icons');
const BACKGROUND = '#170e10'; // matches theme_color / background_color in the manifest

const ICONS = [
    { file: 'icon-192.png', size: 192, emblem: 0.94 },
    { file: 'icon-512.png', size: 512, emblem: 0.94 },
    { file: 'icon-maskable-512.png', size: 512, emblem: 0.76 }
];

const chrome = process.env.CHROME ?? {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}[process.platform] ?? 'google-chrome';

const svg = readFileSync(join(root, 'docs', 'design', 'logo', 'logo-emblem.svg'), 'utf8');
const emblemUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

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

    mkdirSync(out, { recursive: true });
    for (const icon of ICONS)
    {
        const px = Math.round(icon.size * icon.emblem);
        const html = `<!doctype html><html><body style="margin:0;width:${icon.size}px;height:${icon.size}px;background:${BACKGROUND};display:grid;place-items:center">`
            + `<img src="${emblemUrl}" width="${px}" height="${px}"></body></html>`;
        await send('Emulation.setDeviceMetricsOverride', { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
        await sleep(400);
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 } });
        writeFileSync(join(out, icon.file), Buffer.from(shot.result.data, 'base64'));
        console.log(`wrote web/public/icons/${icon.file} (${icon.size}px, emblem ${Math.round(icon.emblem * 100)}%)`);
    }
    ws.close();
}
finally
{
    proc.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
}
