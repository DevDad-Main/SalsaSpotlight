const { app, BrowserWindow, globalShortcut, ipcMain, shell, screen, Tray, Menu, nativeImage, clipboard, nativeTheme, net, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { spawn, execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

let updateReady = null;
if (!app.requestSingleInstanceLock()) app.quit();

function logError(e) {
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'error.log'), `${new Date().toISOString()} ${e?.stack || e}\n`); } catch { /* ignore */ }
}

// Failsafe: log instead of showing error dialogs, and exit if errors keep repeating.
let errorTimes = [];
process.on('uncaughtException', (e) => {
  logError(e);
  const now = Date.now();
  errorTimes = errorTimes.filter((t) => now - t < 10000).concat(now);
  if (errorTimes.length >= 5) app.exit(1);
});
process.on('unhandledRejection', logError);

const WIDTH = 700;
const WIDGETS = {
  clock: { title: 'Clock', size: [290, 180] },
  worldclock: { title: 'World Clock', size: [300, 230] },
  weather: { title: 'Weather', size: [330, 280] },
  system: { title: 'System Monitor', size: [310, 260] },
  specs: { title: 'PC Specs', size: [360, 480] },
  disks: { title: 'Storage', size: [310, 240] },
  calendar: { title: 'Calendar', size: [300, 310] },
  progress: { title: 'Day & Year Progress', size: [300, 250] },
  timer: { title: 'Timer', size: [290, 310] },
  todo: { title: 'To-do', size: [310, 350] },
  notes: { title: 'Notes', size: [300, 290] },
  dock: { title: 'Frequent Apps', size: [340, 180] },
  clipboard: { title: 'Clipboard', size: [340, 350] },
};
const ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
};

const DEFAULTS = {
  v: 2,
  hotkey: 'Alt+Space',
  spotlightStyle: 'rounded',
  peekKey: 'Alt+W',
  launchAtLogin: false,
  theme: 'system',
  accent: '#8b95ff',
  tint: 0.45,
  animations: true,
  clipboard: true,
  widgetMode: 'top',
  widgetOpacity: 0.9,
  widgetScale: 1,
  search: { apps: true, files: true, folders: true, calc: true, commands: true, web: true, recents: true, maxResults: 8, engine: 'google' },
  widgetOpts: {
    clock: { h24: false, seconds: true, analog: false },
    worldclock: { zones: 'America/New_York,Europe/London,Asia/Tokyo' },
    weather: { city: 'London', units: 'c' },
    system: { graph: true, battery: true },
    specs: { host: true, user: true, os: true, cpu: true, gpu: true, ram: true, screen: true, ip: true, uptime: true, rig: true },
    calendar: { mondayFirst: true },
  },
};

let win, tray, settingsWin, quitting = false;
let items = [];
const widgetWins = {};
let settings = { usage: {}, widgets: {} };
let prefs = structuredClone(DEFAULTS);

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(t, s) {
  for (const k of Object.keys(s)) {
    if (isObj(s[k]) && isObj(t[k])) merge(t[k], s[k]); else if (k in t) t[k] = s[k];
  }
  return t;
}
function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    settings = { usage: raw.usage || {}, widgets: raw.widgets || {} };
    if (raw.prefs) merge(prefs, raw.prefs);
    if (raw.prefs?.v !== 2) prefs.widgetMode = 'top';
  } catch { /* first run */ }
  prefs.launchAtLogin = app.getLoginItemSettings().openAtLogin;
}
let saveTimer;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(settingsFile(), JSON.stringify({ ...settings, prefs }), () => {}), 300);
}

const state = () => ({
  prefs,
  open: Object.fromEntries(Object.keys(WIDGETS).map((t) => [t, !!widgetWins[t]])),
  widgets: Object.fromEntries(Object.entries(WIDGETS).map(([k, v]) => [k, v.title])),
  poller: pollerOk,
});
function broadcastState() {
  const s = state();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('state', s);
}

function setPref(key, val) {
  const parts = key.split('.');
  let o = prefs;
  for (const p of parts.slice(0, -1)) { o = o[p]; if (!isObj(o)) return; }
  const last = parts[parts.length - 1];
  if (!(last in o)) return;
  o[last] = val;
  saveSettings();
  onPref(key);
  broadcastState();
}

function onPref(key) {
  if (key === 'hotkey' || key === 'peekKey') registerKeys();
  else if (key === 'theme') nativeTheme.themeSource = prefs.theme;
  else if (key === 'spotlightStyle') { const old = win; createWindow(); old.destroy(); }
  else if (key === 'widgetMode') { ensurePoller(); applyVisibility(); }
  else if (key === 'widgetScale') for (const [t, w] of Object.entries(widgetWins)) sizeWidget(t, w);
  else if (key === 'clipboard') clipTimerSet();
  else if (key === 'launchAtLogin') app.setLoginItemSettings({ openAtLogin: !!prefs.launchAtLogin });
}

// ---------- indexing ----------
let indexing = false;
function startIndex() {
  if (indexing) return;
  indexing = true;
  const target = items.length ? [] : items;
  const w = new Worker(path.join(__dirname, 'indexer.js'), {
    workerData: { home: os.homedir(), appdata: process.env.APPDATA, programData: process.env.ProgramData },
  });
  w.on('message', (m) => {
    if (m.batch) for (const [n, p, k] of m.batch) { const l = n.toLowerCase(); target.push({ n, l, c: l.replace(/[^a-z0-9]/g, ''), p, k }); }
    if (m.done) { items = target; indexing = false; w.terminate(); }
  });
  w.on('error', () => { indexing = false; });
}

// ---------- search ----------
function commandList() {
  return [
    { id: 'winsettings', title: 'Windows Settings', sub: 'Open Windows Settings', kw: 'control panel' },
    { id: 'prefs', title: 'Spotlight Settings', sub: 'Customize Spotlight and widgets', kw: 'preferences options customize' },
    { id: 'taskmgr', title: 'Task Manager', sub: 'Open Task Manager', kw: 'processes performance' },
    { id: 'update', title: 'Check for updates', sub: 'Download and install the latest version', kw: 'upgrade version' },
    { id: 'lock', title: 'Lock PC', sub: 'Lock this computer', kw: 'lock screen' },
    { id: 'peek', title: 'Peek widgets', sub: 'Show or hide widgets on top', kw: 'widgets show hide' },
    ...Object.entries(WIDGETS).map(([t, w]) => ({ id: 'w-' + t, title: `Toggle ${w.title} widget`, sub: 'Floating widget', kw: 'widget' })),
    { id: 'reindex', title: 'Rebuild search index', sub: 'Rescan files and apps', kw: 'refresh' },
    { id: 'quit', title: 'Quit Spotlight', sub: 'Exit the launcher', kw: 'exit close' },
  ];
}

function scoreName(l, q, words) {
  if (l === q) return 1000;
  if (l.startsWith(q)) return 800;
  const i = l.indexOf(q);
  if (i > 0) return /[\s._\-(\[]/.test(l[i - 1]) ? 700 : 500;
  if (words.length > 1 && words.every((w) => l.includes(w))) return 400;
  return 0;
}

function fuzzy(l, q) {
  let j = 0;
  for (let i = 0; i < l.length && j < q.length; i++) if (l[i] === q[j]) j++;
  return j === q.length;
}

function calc(q) {
  if (!/^[\d\s+\-*/%^().]+$/.test(q) || !/\d/.test(q) || !/[+\-*/%^]/.test(q.replace(/^\s*-/, ''))) return null;
  try {
    const v = Function(`"use strict";return (${q.replace(/\^/g, '**')})`)();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    const text = String(Math.round(v * 1e10) / 1e10);
    return { kind: 'calc', title: text, sub: `${q.trim()} = ${text}  (Enter to copy)`, value: text };
  } catch { return null; }
}

const kindOf = (k) => (k === 1 ? 'folder' : k === 0 ? 'file' : 'app');
const extOf = (p) => { const i = p.lastIndexOf('.'); return i > p.lastIndexOf('\\') ? p.slice(i + 1).toLowerCase() : ''; };

// Supports ext:png, .exe, *.exe, type:app|exe|folder|file, in:downloads, glob (*, ?) and /regex/.
function parseQuery(raw) {
  const f = { text: [], ext: null, type: null, inPath: null, regex: null, glob: null, active: false };
  const m = raw.trim().match(/^\/(.+)\/$/);
  if (m) { try { f.regex = new RegExp(m[1], 'i'); return f; } catch { /* treat as plain text */ } }
  for (const tok of raw.trim().split(/\s+/)) {
    let g;
    if ((g = tok.match(/^(?:ext:|\.|\*\.)(\w{1,8})$/i))) f.ext = g[1].toLowerCase();
    else if ((g = tok.match(/^(?:type|kind):(app|exe|folder|file)s?$/i))) f.type = g[1].toLowerCase();
    else if ((g = tok.match(/^(?:in|path):(.+)$/i))) f.inPath = g[1].toLowerCase();
    else if (/[*?]/.test(tok)) f.glob = new RegExp('^' + tok.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    else f.text.push(tok);
  }
  f.active = !!(f.ext || f.type || f.inPath || f.glob);
  return f;
}

function search(raw) {
  const S = prefs.search;
  const f = parseQuery(raw);
  const q = f.text.join(' ').toLowerCase();
  const filtered = f.active || !!f.regex;
  if (!raw.trim()) {
    if (!S.recents) return [];
    return Object.entries(settings.usage)
      .sort((a, b) => b[1].c - a[1].c).slice(0, 5)
      .map(([p, u]) => ({ kind: kindOf(u.k), title: u.n, sub: p, path: p, k: u.k }));
  }
  if (!filtered && (q === 'clip' || q.startsWith('clip '))) {
    const cf = q.slice(5).trim();
    const list = clipHistory.filter((t) => !cf || t.toLowerCase().includes(cf)).slice(0, 8);
    if (list.length) return list.map((t) => ({ kind: 'clip', title: t.replace(/\s+/g, ' ').slice(0, 90), sub: `${t.length} characters (Enter to copy)`, value: t }));
  }
  const words = q.split(/\s+/).filter(Boolean);
  const cq = q.replace(/[^a-z0-9]/g, '');
  const allow = [S.files, S.folders, S.apps, S.apps];
  let hits = [];
  const consider = (item, s) => {
    hits.push([s, item]);
    if (hits.length > 3000) { hits.sort((a, b) => b[0] - a[0]); hits.length = 60; }
  };

  for (const it of items) {
    if (!allow[it.k]) continue;
    if (f.type && !(f.type === 'folder' ? it.k === 1 : f.type === 'file' ? it.k === 0 : f.type === 'exe' ? it.k === 3 : it.k >= 2)) continue;
    if (f.ext && extOf(it.p) !== f.ext && !(f.ext === 'exe' && it.k === 2)) continue;
    if (f.inPath && !it.p.toLowerCase().includes(f.inPath)) continue;
    let s;
    if (f.regex) s = f.regex.test(it.n) ? 600 : 0;
    else if (f.glob) s = f.glob.test(it.n) || (it.k === 3 && f.glob.test(it.n + '.exe')) ? 600 : 0;
    else if (!q) s = 500;
    else {
      s = scoreName(it.l, q, words);
      if (!s && cq.length >= 2) s = it.c === cq ? 900 : it.c.startsWith(cq) ? 750 : it.c.includes(cq) ? 450 : 0;
      if (!s && it.k >= 2 && q.length >= 2 && fuzzy(it.l, q)) s = 200;
    }
    if (!s) continue;
    const u = settings.usage[it.p];
    s = (it.k === 1 ? s * 0.75 : s) + (it.k === 3 ? 300 : it.k === 2 ? 150 : 0) + (u ? Math.min(u.c, 10) * 20 : 0) - it.l.length * 0.5;
    consider(it, s);
  }
  if (S.commands && !filtered) {
    for (const c of commandList()) {
      const l = `${c.title} ${c.kw}`.toLowerCase();
      const s = scoreName(l, q, words) || (l.split(' ').some((w) => w.startsWith(q)) ? 650 : 0);
      if (s) consider({ cmd: c }, s + 100);
    }
  }
  hits.sort((a, b) => b[0] - a[0]);

  const out = [];
  const c = !filtered && S.calc && calc(raw);
  if (c) out.push(c);
  for (const [, it] of hits.slice(0, S.maxResults)) {
    if (it.cmd) out.push({ kind: 'cmd', title: it.cmd.title, sub: it.cmd.sub, cmd: it.cmd.id });
    else out.push({ kind: kindOf(it.k), title: it.n, sub: path.dirname(it.p), path: it.p, k: it.k });
  }
  if (S.web && !filtered) out.push({ kind: 'web', title: `Search the web for "${raw.trim()}"`, sub: 'Opens in your browser' });
  return out;
}

// ---------- launcher window ----------
const PAD = () => (prefs.spotlightStyle === 'rounded' ? 18 : 0);
const winWidth = () => WIDTH + PAD() * 2;

function createWindow() {
  const rounded = prefs.spotlightStyle === 'rounded';
  win = new BrowserWindow({
    width: winWidth(), height: 70 + PAD() * 2, show: false, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    ...(rounded ? { transparent: true, hasShadow: false } : { backgroundMaterial: 'acrylic', roundedCorners: true, thickFrame: false }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('blur', () => win.hide());
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function toggle() {
  if (win.isVisible()) return win.hide();
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win.setPosition(Math.round(d.x + (d.width - winWidth()) / 2), Math.round(d.y + d.height * 0.2 - PAD()));
  win.show();
  win.focus();
  win.webContents.send('shown');
}

function openSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 900, height: 660, minWidth: 740, minHeight: 520, backgroundMaterial: 'mica',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000', height: 38 },
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- widgets ----------
let desktopFocus = false, peek = false, flashing = false, flashTimer;
const topMost = () => prefs.widgetMode === 'top' || peek || flashing;
const shouldShow = () => topMost() || (prefs.widgetMode === 'desktop' && desktopFocus);

function applyVisibility() {
  const show = shouldShow();
  for (const w of Object.values(widgetWins)) {
    if (w.isDestroyed() || !w.__ready) continue;
    w.setAlwaysOnTop(topMost());
    clearTimeout(w.__hide);
    if (show) {
      if (!w.isVisible()) w.showInactive();
      w.webContents.send('vis', true);
    } else if (w.isVisible()) {
      w.webContents.send('vis', false);
      w.__hide = setTimeout(() => { if (!w.isDestroyed() && !shouldShow()) w.hide(); }, 260);
    }
  }
}

function flash(ms) {
  flashing = true;
  applyVisibility();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashing = false; applyVisibility(); }, ms);
}

function sizeWidget(type, w) {
  const s = prefs.widgetScale;
  const [bw, bh] = WIDGETS[type].size;
  w.setContentSize(Math.round(bw * s), Math.round(bh * s));
  w.webContents.setZoomFactor(s);
}

function openWidget(type) {
  if (widgetWins[type]) return;
  const [bw, bh] = WIDGETS[type].size;
  const s = prefs.widgetScale;
  const saved = settings.widgets[type] || {};
  const n = Object.keys(widgetWins).length;
  const d = screen.getPrimaryDisplay().workArea;
  const w = new BrowserWindow({
    width: Math.round(bw * s), height: Math.round(bh * s),
    x: saved.x ?? d.x + d.width - Math.round(bw * s) - 24 - (n % 3) * 30,
    y: saved.y ?? d.y + 24 + n * 40,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, hasShadow: false, show: false,
    focusable: true, webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  widgetWins[type] = w;
  w.loadFile(path.join(__dirname, 'renderer', 'widget.html'), { query: { type } });
  w.webContents.on('did-finish-load', () => w.webContents.setZoomFactor(prefs.widgetScale));
  w.once('ready-to-show', () => { w.__ready = true; applyVisibility(); });
  w.on('moved', () => {
    const [x, y] = w.getPosition();
    settings.widgets[type] = { ...settings.widgets[type], x, y, open: true };
    saveSettings();
  });
  w.on('closed', () => {
    delete widgetWins[type];
    if (!quitting) { settings.widgets[type] = { ...settings.widgets[type], open: false }; saveSettings(); broadcastState(); }
  });
  settings.widgets[type] = { ...saved, open: true };
  saveSettings();
  broadcastState();
}

function toggleWidget(type) {
  if (!WIDGETS[type]) return;
  if (widgetWins[type]) widgetWins[type].close();
  else { openWidget(type); flash(4000); }
}

// Foreground-window poller: shows widgets only while the desktop is focused.
const POLL_SCRIPT = `
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Runtime.InteropServices;
public static class FG{
[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetClassName(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
}
'@
$last=''
while($true){
 $h=[FG]::GetForegroundWindow()
 $sb=New-Object System.Text.StringBuilder 256
 [void][FG]::GetClassName($h,$sb,256)
 $p=[uint32]0
 [void][FG]::GetWindowThreadProcessId($h,[ref]$p)
 $o=$sb.ToString()+'|'+$p
 if($o -ne $last){$last=$o;[Console]::Out.WriteLine($o);[Console]::Out.Flush()}
 Start-Sleep -Milliseconds 250
}`;
const IGNORE_CLASSES = new Set([
  '', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'TaskListThumbnailWnd', 'MultitaskingViewFrame', 'XamlExplorerHostIslandWindow',
  'ForegroundStaging', 'TaskSwitcherWnd', 'Windows.UI.Core.CoreWindow', 'NotifyIconOverflowWindow', 'TopLevelWindowForOverflowXamlIsland',
]);
let poller = null, pollerOk = false;

function onForeground(cls, pid) {
  if (pid === process.pid || IGNORE_CLASSES.has(cls)) return;
  const d = cls === 'Progman' || cls === 'WorkerW';
  if (d !== desktopFocus) { desktopFocus = d; applyVisibility(); }
}

function ensurePoller() {
  if (prefs.widgetMode !== 'desktop') {
    if (poller) { poller.kill(); poller = null; }
    pollerOk = false; desktopFocus = false;
    broadcastState();
    return;
  }
  if (poller) return;
  poller = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(POLL_SCRIPT, 'utf16le').toString('base64')],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let buf = '';
  poller.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const [cls, pid] = line.split('|');
      if (pid === undefined) continue;
      if (!pollerOk) { pollerOk = true; broadcastState(); }
      onForeground(cls, Number(pid));
    }
  });
  poller.on('exit', () => { poller = null; pollerOk = false; broadcastState(); });
}

// ---------- clipboard history (memory only) ----------
let clipHistory = [], lastClip = '', clipTimer;
function clipTimerSet() {
  clearInterval(clipTimer);
  if (!prefs.clipboard) { clipHistory = []; lastClip = ''; return; }
  let failures = 0;
  clipTimer = setInterval(() => {
    try {
      const raw = clipboard.readText();
      if (typeof raw !== 'string' || !raw || raw === lastClip || raw.length > 5000) return;
      lastClip = raw;
      const t = raw.replace(/\0/g, '').replace(/[\uD800-\uDFFF]/g, '');
      clipHistory = [t, ...clipHistory.filter((x) => x !== t)].slice(0, 30);
      const w = widgetWins.clipboard;
      if (w && !w.isDestroyed()) w.webContents.send('clip', clipHistory);
    } catch (e) {
      logError(e);
      if (++failures >= 3) clearInterval(clipTimer);
    }
  }, 700);
}

// ---------- system info ----------
let staticSpecs;
const VIRTUAL_GPU = /microsoft basic display adapter|vnc mirror driver|virtual|remote display|indirect display/i;
const TR_PRO = 'AMD Ryzen Threadripper PRO 5955WX 16-Core (Zen3)';
const EPYC = 'AMD EPYC 9375F 32-Core (Zen5)';
const GFN_RIGS = [
  { match: /RTX 3050/i, rig: '3050b (RTX 3050)', tier: 'Free', cpu: TR_PRO, allocation: '5C/5T', memory: '8GB / 14GB', vram: '6GB' },
  { match: /RTX 3060/i, rig: '3060d (RTX 3060)', tier: 'Performance', cpu: TR_PRO, allocation: '4C/8T', memory: '28GB', vram: '12GB' },
  { match: /RTX 5080/i, rig: '5080h (RTX 5080)', tier: 'Ultimate', cpu: EPYC, allocation: '8C/16T', memory: '56GB', vram: '48GB' },
  { match: /RTX 4080/i, rig: '4080h (RTX 4080)', tier: 'Ultimate', cpu: TR_PRO, allocation: '8C/16T', memory: '56GB', vram: '24GB' },
];
const GFN_LOG = path.join(process.env.ProgramData || 'C:\\ProgramData', 'NVIDIA Corporation', 'NvStream', 'NvStreamerCurrent.log');

const runText = (cmd, args, timeout = 8000) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout, encoding: 'utf8' }, (err, out) => resolve(err ? '' : String(out)));
});
const lines = (s) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

async function gpuNames() {
  let names = lines(await runText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_VideoController).Name']));
  if (!names.length) names = lines(await runText('wmic.exe', ['path', 'win32_VideoController', 'get', 'name'])).filter((n) => n.toLowerCase() !== 'name');
  const real = names.filter((n) => !VIRTUAL_GPU.test(n));
  if (real.length) return real;
  try {
    const i = await app.getGPUInfoAsync('complete');
    return (i.gpuDevice || []).map((d) => d.deviceString).filter((n) => n && !VIRTUAL_GPU.test(n));
  } catch { return []; }
}

async function gpuVram() {
  const pf = process.env.ProgramW6432 || process.env.ProgramFiles;
  const candidates = [pf && path.join(pf, 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'), path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'), 'nvidia-smi.exe'].filter(Boolean);
  for (const exe of candidates) {
    if (path.isAbsolute(exe) && !fs.existsSync(exe)) continue;
    const mib = Number(lines(await runText(exe, ['--query-gpu=memory.total', '--format=csv,noheader,nounits'], 4000))[0]);
    if (mib > 0) return `${Math.round(mib / 1024)}GB`;
  }
  return null;
}

async function getSpecs() {
  if (!staticSpecs) {
    const cpus = os.cpus();
    let osName = os.version();
    if (parseInt(os.release().split('.')[2], 10) >= 22000) osName = osName.replace('Windows 10', 'Windows 11');
    const gpu = await gpuNames();
    const rig = GFN_RIGS.find((r) => gpu.some((n) => r.match.test(n))) || null;
    let gfn = false;
    try { gfn = fs.statSync(GFN_LOG).size > 0; } catch { /* not a GeForce NOW session */ }
    staticSpecs = {
      host: os.hostname(), user: os.userInfo().username, os: `${osName} (build ${os.release().split('.')[2]})`,
      cpu: rig ? rig.cpu : (cpus[0]?.model || 'Unknown').replace(/\s+/g, ' ').trim(),
      cores: rig ? rig.allocation : `${cpus.length} threads`,
      ram: os.totalmem(), ramLabel: rig ? rig.memory : null,
      gpu, vram: rig ? rig.vram : await gpuVram(), rig, gfn,
    };
  }
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  const screens = screen.getAllDisplays().map((d) => `${Math.round(d.size.width * d.scaleFactor)}x${Math.round(d.size.height * d.scaleFactor)} @ ${Math.round(d.displayFrequency)}Hz`);
  return { ...staticSpecs, ip, screens, uptime: os.uptime() };
}

let lastCpu = null;
const cpuTimes = () => {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; }
  return { idle, total };
};

const weatherCache = {};
async function getWeather(city, units) {
  const key = `${city}|${units}`;
  const hit = weatherCache[key];
  if (hit && Date.now() - hit.t < 15 * 60 * 1000) return hit.d;
  try {
    const g = await (await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)).json();
    const loc = g.results?.[0];
    if (!loc) return { error: 'City not found' };
    const f = units === 'f';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}`
      + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
      + '&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=2'
      + `&temperature_unit=${f ? 'fahrenheit' : 'celsius'}&wind_speed_unit=${f ? 'mph' : 'kmh'}`;
    const w = await (await net.fetch(url)).json();
    const c = w.current;
    const idx = w.hourly.time.findIndex((t) => t >= c.time.slice(0, 13));
    const d = {
      city: loc.name, country: loc.country_code, temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m, code: c.weather_code, isDay: !!c.is_day, hi: w.daily.temperature_2m_max[0], lo: w.daily.temperature_2m_min[0],
      sunrise: w.daily.sunrise[0].slice(11, 16), sunset: w.daily.sunset[0].slice(11, 16),
      unit: f ? '°F' : '°C', windUnit: f ? 'mph' : 'km/h',
      hours: w.hourly.time.slice(idx + 1, idx + 7).map((t, i) => ({ h: t.slice(11, 16), t: w.hourly.temperature_2m[idx + 1 + i], code: w.hourly.weather_code[idx + 1 + i] })),
    };
    weatherCache[key] = { t: Date.now(), d };
    return d;
  } catch { return { error: 'Offline or weather service unavailable' }; }
}

// ---------- actions ----------
function runCommand(id) {
  switch (id) {
    case 'winsettings': shell.openExternal('ms-settings:'); break;
    case 'prefs': openSettings(); break;
    case 'taskmgr': spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore' }).unref(); break;
    case 'lock': spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref(); break;
    case 'peek': peek = !peek; applyVisibility(); break;
    case 'reindex': startIndex(); break;
    case 'update': checkUpdates(true); break;
    case 'quit': app.quit(); break;
    default: if (id.startsWith('w-')) toggleWidget(id.slice(2));
  }
}

const iconCache = new Map();
async function loadIcon(p) {
  const tries = [p];
  if (path.extname(p).toLowerCase() === '.lnk') {
    try {
      const l = shell.readShortcutLink(p);
      if (l.icon) tries.unshift(l.icon);
      if (l.target) tries.push(l.target);
    } catch { /* unreadable shortcut */ }
  }
  for (const t of tries) {
    for (const size of ['large', 'normal']) {
      try {
        const img = await app.getFileIcon(t, { size });
        if (img && !img.isEmpty()) return img.toDataURL();
      } catch { /* try next */ }
    }
  }
  return null;
}
ipcMain.handle('icon', (_e, p) => {
  const ext = path.extname(p).toLowerCase();
  const key = ['.lnk', '.exe', ''].includes(ext) ? p : ext;
  if (!iconCache.has(key)) {
    iconCache.set(key, loadIcon(p).then((r) => { if (!r) iconCache.delete(key); return r; }));
  }
  return iconCache.get(key);
});

ipcMain.handle('search', (_e, q) => search(String(q)));

ipcMain.handle('run', async (_e, { item, q, reveal }) => {
  win.hide();
  if (item.path) {
    if (reveal) shell.showItemInFolder(item.path);
    else shell.openPath(item.path);
    const u = settings.usage[item.path] || { c: 0 };
    settings.usage[item.path] = { c: u.c + 1, n: path.basename(item.path).replace(/\.lnk$/i, ''), k: item.k ?? 0 };
    saveSettings();
  } else if (item.kind === 'cmd') runCommand(String(item.cmd));
  else if (item.kind === 'calc' || item.kind === 'clip') clipboard.writeText(String(item.value));
  else if (item.kind === 'web') shell.openExternal((ENGINES[prefs.search.engine] || ENGINES.google) + encodeURIComponent(q));
});

ipcMain.on('resize', (_e, h) => { if (win) win.setContentSize(winWidth(), Math.max(70 + PAD() * 2, Math.min(h, 860))); });
ipcMain.on('hide', () => win.hide());
ipcMain.on('widget-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

ipcMain.handle('state', () => state());
ipcMain.on('set', (_e, key, val) => setPref(String(key), val));
ipcMain.on('toggle-widget', (_e, t) => toggleWidget(String(t)));
ipcMain.on('open-settings', openSettings);
ipcMain.on('reset', () => {
  const keep = prefs.launchAtLogin;
  prefs = structuredClone(DEFAULTS);
  prefs.launchAtLogin = keep;
  saveSettings();
  nativeTheme.themeSource = prefs.theme;
  registerKeys(); ensurePoller(); clipTimerSet();
  for (const [t, w] of Object.entries(widgetWins)) sizeWidget(t, w);
  applyVisibility();
  broadcastState();
});

ipcMain.handle('stats', () => {
  const now = cpuTimes();
  const prev = lastCpu || now;
  lastCpu = now;
  const dt = now.total - prev.total;
  return {
    cpu: dt > 0 ? 100 * (1 - (now.idle - prev.idle) / dt) : 0,
    mem: 100 * (1 - os.freemem() / os.totalmem()),
    memUsed: (os.totalmem() - os.freemem()) / 1024 ** 3,
    memTotal: os.totalmem() / 1024 ** 3,
    uptime: os.uptime(),
  };
});
ipcMain.handle('specs', () => getSpecs());
ipcMain.handle('disks', () => {
  const out = [];
  for (let c = 67; c <= 90; c++) {
    const root = String.fromCharCode(c) + ':\\';
    try {
      const s = fs.statfsSync(root);
      const total = s.blocks * s.bsize;
      if (total > 0) out.push({ name: root.slice(0, 2), total, free: s.bavail * s.bsize });
    } catch { /* drive not present */ }
  }
  return out;
});
ipcMain.handle('weather', (_e, city, units) => getWeather(String(city), units === 'f' ? 'f' : 'c'));
ipcMain.handle('top-apps', () => Object.entries(settings.usage)
  .filter(([, u]) => u.k === 2).sort((a, b) => b[1].c - a[1].c).slice(0, 8).map(([p, u]) => ({ p, n: u.n })));
ipcMain.on('open-path', (_e, p) => { if (settings.usage[p]) shell.openPath(p); });
ipcMain.handle('clip-get', () => clipHistory);
ipcMain.on('clip-copy', (_e, i) => { if (clipHistory[i]) clipboard.writeText(clipHistory[i]); });
ipcMain.on('clip-clear', () => {
  clipHistory = [];
  for (const w of Object.values(widgetWins)) if (!w.isDestroyed()) w.webContents.send('clip', clipHistory);
});

// ---------- auto-update (GitHub releases) ----------
let manualCheck = false;
const notify = (title, body) => new Notification({ title, body }).show();

function checkUpdates(manual) {
  if (!app.isPackaged) { if (manual) notify('Updates', 'Updates only work in the installed app.'); return; }
  manualCheck = manual;
  if (manual && updateReady) { quitting = true; autoUpdater.quitAndInstall(false, true); return; }
  if (manual) notify('Checking for updates', `Current version ${app.getVersion()}`);
  autoUpdater.checkForUpdates().catch(logError);
}

function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => { logError(e); if (manualCheck) notify('Update failed', 'Could not reach GitHub. Try again later.'); });
  autoUpdater.on('update-not-available', () => { if (manualCheck) notify('You are up to date', `SalsaSpotlight ${app.getVersion()} is the latest version.`); manualCheck = false; });
  autoUpdater.on('update-available', (info) => { if (manualCheck) notify('Update found', `Downloading ${info.version}...`); });
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = info.version;
    if (manualCheck) { quitting = true; autoUpdater.quitAndInstall(false, true); return; }
    notify('Update ready', `SalsaSpotlight ${info.version} installs when you quit. Right-click the tray icon to restart now.`);
  });
  checkUpdates(false);
  setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000);
}

// ---------- tray ----------
function trayIcon() {
  const S = 32, buf = Buffer.alloc(S * S * 4);
  const segDist = (px, py) => {
    const ax = 18, ay = 18, bx = 26, by = 26;
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / 128));
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - 13, y - 13);
    const on = (r > 6.5 && r < 9.5) || segDist(x, y) < 1.8;
    const i = (y * S + x) * 4;
    buf[i] = buf[i + 1] = buf[i + 2] = 255;
    buf[i + 3] = on ? 255 : 0;
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Spotlight');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Spotlight', click: toggle },
    { label: 'Settings...', click: openSettings },
    ...(updateReady ? [{ label: `Restart to update to ${updateReady}`, click: () => { quitting = true; autoUpdater.quitAndInstall(false, true); } }] : []),
    { type: 'separator' },
    { label: 'Peek widgets on top', type: 'checkbox', checked: peek, click: () => { peek = !peek; applyVisibility(); } },
    { label: 'Widgets', submenu: Object.keys(WIDGETS).map((t) => ({ label: WIDGETS[t].title, type: 'checkbox', checked: !!widgetWins[t], click: () => toggleWidget(t) })) },
    { type: 'separator' },
    { label: 'Launch at login', type: 'checkbox', checked: prefs.launchAtLogin, click: (i) => setPref('launchAtLogin', i.checked) },
    { label: 'Rebuild index', click: startIndex },
    { label: 'Check for updates', click: () => checkUpdates(true) },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.on('click', toggle);
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
}

function registerKeys() {
  globalShortcut.unregisterAll();
  const primary = !!prefs.hotkey && globalShortcut.register(prefs.hotkey, toggle);
  if (!primary) globalShortcut.register('Ctrl+Space', toggle);
  if (prefs.peekKey) globalShortcut.register(prefs.peekKey, () => { peek = !peek; applyVisibility(); });
  return primary;
}

// ---------- lifecycle ----------
app.whenReady().then(() => {
  const firstRun = !fs.existsSync(settingsFile());
  loadSettings();
  nativeTheme.themeSource = prefs.theme;
  createWindow();
  createTray();
  const hotkeyOk = registerKeys();
  if (firstRun || !hotkeyOk) {
    new Notification({
      title: 'SalsaSpotlight is running',
      body: hotkeyOk ? `Press ${prefs.hotkey.replace('+', ' + ')} to search. Find it in the system tray too.`
        : `${prefs.hotkey} is taken by another app, so use Ctrl + Space instead. Change it in Settings.`,
    }).show();
    if (firstRun) setTimeout(toggle, 800);
  }
  startIndex();
  setupUpdates();
  setInterval(startIndex, 10 * 60 * 1000);
  clipTimerSet();
  ensurePoller();
  for (const t of Object.keys(WIDGETS)) if (settings.widgets[t]?.open) openWidget(t);
});

app.on('before-quit', () => { quitting = true; });
app.on('second-instance', () => { if (win && !win.isVisible()) toggle(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); poller?.kill(); });
app.on('window-all-closed', (e) => e.preventDefault());
