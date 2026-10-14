const { app, BrowserWindow, globalShortcut, ipcMain, shell, screen, Tray, Menu, nativeImage, clipboard, nativeTheme, net, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');
const { spawn, execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');
const startupBatch = require('./startup-batch');

const STARTUP_STABLE_RUN_MS = 10 * 60 * 1000;
let startupStableTimer;
function scheduleStartupStableClear() {
  clearTimeout(startupStableTimer);
  startupStableTimer = null;
  const counterPath = startupBatch.defaultCounterPath();
  if (!startupBatch.readFailedStarts(counterPath)) return;
  startupStableTimer = setTimeout(() => {
    startupBatch.clearFailedStarts(counterPath);
  }, STARTUP_STABLE_RUN_MS);
}

let updateReady = null;
const updateInfo = { status: 'idle', latest: null, percent: 0, error: '', checkedAt: 0 };
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
// Standard macOS-style modular widths (330px standard column width)
const WIDGETS = {
  clock: { title: 'Clock', size: [330, 195] },
  worldclock: { title: 'World Clock', size: [330, 240] },
  weather: { title: 'Weather', size: [330, 270] },
  system: { title: 'System Monitor', size: [330, 340] },
  specs: { title: 'PC Specs', size: [330, 480] },
  disks: { title: 'Storage', size: [330, 240] },
  calendar: { title: 'Calendar', size: [330, 310] },
  progress: { title: 'Day & Year Progress', size: [330, 240] },
  timer: { title: 'Timer', size: [330, 300] },
  todo: { title: 'To-do', size: [330, 340] },
  notes: { title: 'Notes', size: [330, 270] },
  dock: { title: 'Frequent Apps', size: [330, 180] },
  clipboard: { title: 'Clipboard', size: [330, 340] },
  gpu: { title: 'GPU', size: [330, 260] },
  network: { title: 'Network', size: [330, 240] },
  countdown: { title: 'Countdown', size: [330, 180] },
  quote: { title: 'Daily Quote', size: [330, 160] },
  pomodoro: { title: 'Pomodoro', size: [330, 280] },
  habits: { title: 'Habits', size: [330, 280] },
  uptime: { title: 'System Uptime', size: [330, 160] },
  speedtest: { title: 'Speed Test', size: [330, 180] },
  calendarEvents: { title: 'Upcoming Events', size: [330, 260] },
  media: { title: 'Now Playing', size: [330, 220] },
};
const SIZES = { s: 0.8, m: 1, l: 1.3, xl: 1.7 };
const SIZE_LABELS = { s: 'Small', m: 'Medium', l: 'Large', xl: 'Extra large' };
const ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  brave: 'https://search.brave.com/search?q=',
};

const DEFAULTS = {
  v: 2,
  hotkey: 'Alt+Space',
  spotlightEffect: 'solid',
  spotlightBlur: 50,
  auroraColor: 'accent',
  indexEvery: 10,
  peekKey: 'Alt+W',
  launchAtLogin: false,
  theme: 'system',
  accent: '#8b95ff',
  widgetRadius: 28,
  widgetBorder: true,
  widgetShadow: true,
  widgetContentScale: 1,
  snapToGrid: true,
  gridCollisions: true,
  autoScale: true,
  launcherRadius: 22,
  launcherWidth: 700,
  launcherTop: 20,
  launcherShadow: false,
  arrangeAnchor: 'top-right',
  showTour: false,
  gfnRig: 'auto',
  tint: 0.45,
  animations: true,
  clipboard: true,
  widgetMode: 'desktop',
  widgetOpacity: 0.9,
  widgetScale: 1,
  search: { apps: true, files: true, folders: true, calc: true, commands: true, web: true, recents: true, maxResults: 8, engine: 'google' },
  widgetLayout: {},
  widgetGap: 12,
  widgetOpts: {
    clock: { h24: false, seconds: true, analog: false },
    worldclock: { zones: 'America/New_York,Europe/London,Asia/Tokyo' },
    weather: { city: 'auto', units: 'c', hours: true },
    system: { graph: true, battery: true, info: true, gpu: true },
    specs: { host: true, user: true, os: true, cpu: true, gpu: true, ram: true, screen: true, ip: true, uptime: true, rig: true },
    calendar: { mondayFirst: true },
    countdown: { title: 'New Year', date: '2027-01-01', recur: 'none' },
    progress: { showYear: true, showDay: true, greeting: true },
    timer: { defaultMins: 25, sound: true },
    todo: { maxItems: 8 },
    notes: { fontSize: 14, markdown: false },
    dock: { columns: 4, maxApps: 8 },
    clipboard: { maxItems: 12 },
    gpu: { showVram: true, showTemp: true, showPower: true, showClock: false, showFan: false },
    network: { showIface: true },
    habits: { maxItems: 5, heatmap: true },
    uptime: { showSeconds: false },
    calendarEvents: { showPast: false, maxEvents: 6 },
    pomodoro: { workMin: 25, breakMin: 5, longBreakMin: 15, sessionsBeforeLong: 4, focusMode: false },
    media: { controls: true },
  },
};

let win, tray, settingsWin, desktopWin, quitting = false;
let pendingTour = false, tourOpen = false;
let items = [];
let openWidgets = new Set();       // widget types currently shown on desktop
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
    if (raw.prefs?.v !== 2) prefs.widgetMode = 'desktop';
    // migrate old spotlightStyle pref to spotlightEffect
    if (!raw.prefs?.spotlightEffect && raw.prefs?.spotlightStyle === 'acrylic') prefs.spotlightEffect = 'acrylic';
  } catch { /* first run */ }
  prefs.launchAtLogin = app.getLoginItemSettings().openAtLogin;
}
let saveTimer;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(settingsFile(), JSON.stringify({ ...settings, prefs }), () => {}), 300);
}

const state = () => ({
  update: { ...updateInfo, version: app.getVersion(), packaged: app.isPackaged },
  sizes: Object.fromEntries(Object.keys(WIDGETS).map((t) => [t, settings.widgets[t]?.size || 'm'])),
  prefs,
  open: Object.fromEntries(Object.keys(WIDGETS).map((t) => [t, openWidgets.has(t)])),
  widgets: Object.fromEntries(Object.entries(WIDGETS).map(([k, v]) => [k, v.title])),
  poller: pollerOk,
  widgetLayout: prefs.widgetLayout || {},
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
  else if (key === 'spotlightEffect') { const old = win; createWindow(); old.destroy(); }
  else if (key === 'indexEvery') armIndexTimer();
  else if (key === 'widgetMode') { ensurePoller(); applyVisibility(); }
  else if (key === 'widgetScale' || key === 'autoScale') relayoutAll();
  else if (key === 'launcherWidth') win.setContentSize(winWidth(), win.getContentSize()[1]);
  else if (key === 'clipboard') clipTimerSet();
  else if (key === 'launchAtLogin') app.setLoginItemSettings({ openAtLogin: !!prefs.launchAtLogin });
  else if (key === 'gfnRig') hwPromise = undefined;
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

let indexTimer = null;
function armIndexTimer() {
  clearInterval(indexTimer);
  const mins = Math.max(1, Number(prefs.indexEvery) || 10);
  indexTimer = setInterval(startIndex, mins * 60 * 1000);
}

// ---------- search ----------
function commandList(q = '') {
  return [
    { id: 'winsettings', title: 'Windows Settings', sub: 'Open Windows Settings', kw: 'control panel system preferences' },
    { id: 'prefs', title: 'Spotlight Settings', sub: 'Customize Spotlight and widgets', kw: 'preferences options customize configure settings' },
    { id: 'taskmgr', title: 'Task Manager', sub: 'Open Task Manager', kw: 'processes performance tasks' },
    { id: 'update', title: 'Check for updates', sub: 'Download and install the latest version', kw: 'upgrade version newer' },
    { id: 'lock', title: 'Lock PC', sub: 'Lock this computer', kw: 'lock screen secure' },
    { id: 'peek', title: 'Peek widgets', sub: 'Show or hide widgets on top', kw: 'widgets show hide peek floating overlay' },
    { id: 'spawn', title: 'Show all widgets', sub: 'Open every widget at once', kw: 'all widgets show open enable everything' },
    { id: 'hideall', title: 'Hide all widgets', sub: 'Close every widget', kw: 'all widgets hide close disable clear' },
    { id: 'resetlayout', title: 'Reset widget layout', sub: 'Clear positions and re-arrange from scratch', kw: 'reset layout clear positions arrange tidy clean restart fresh' },
    ...Object.entries(WIDGETS).map(([t, w]) => ({
      id: 'w-' + t,
      title: openWidgets.has(t) ? `Hide ${w.title}` : `Show ${w.title}`,
      sub: openWidgets.has(t) ? 'Widget is open — click to close' : 'Widget is closed — click to open',
      kw: `widget toggle ${t} ${w.title.toLowerCase()} ${openWidgets.has(t) ? 'hide close remove' : 'show open add'}`,
    })),
    ...(/size|small|medium|large|big|tiny/.test(q) ? Object.entries(WIDGETS).flatMap(([t, w]) => Object.entries(SIZE_LABELS).map(([k, l]) => ({ id: `size-${t}-${k}`, title: `Resize ${w.title}: ${l}`, sub: 'Change widget size', kw: `resize size widget ${t}` }))) : []),
    { id: 'reindex', title: 'Rebuild search index', sub: 'Rescan files and apps', kw: 'refresh rescan index rebuild' },
    { id: 'screenshot', title: 'Take screenshot', sub: 'Capture screen and save to Pictures', kw: 'screenshot capture screen grab print snap' },
    { id: 'quit', title: 'Quit Spotlight', sub: 'Exit the launcher', kw: 'exit close quit shutdown' },
  ];
}

// Fuzzy match score: higher = better. Returns 0 if no match.
function fuzzyScore(text, query) {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  if (t.includes(q)) return 600;
  // Subsequence matching with bonuses for consecutive/word-boundary matches
  let ti = 0, score = 0, consecutive = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) { found = i; break; }
    }
    if (found === -1) return 0; // character not found — no match
    // Bonus for consecutive characters
    if (found === ti && qi > 0) consecutive++;
    else consecutive = 0;
    // Bonus for word boundary
    const atWordStart = found === 0 || /[\s._\-([/]/.test(t[found - 1]);
    score += 10 + consecutive * 15 + (atWordStart ? 20 : 0);
    ti = found + 1;
  }
  // Penalty for long text (prefer shorter matches)
  score -= Math.min(t.length * 0.3, 30);
  return Math.max(0, Math.round(score));
}

// Legacy exact/substring scoring for backward compatibility
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

function calc(raw) {
  let q = String(raw || '').trim();
  if (q.endsWith('=')) q = q.slice(0, -1).trim();
  q = q.replace(/x/gi, '*').replace(/÷/g, '/').replace(/,/g, '');
  if (!/^[\d\s+\-*/%^().]+$/.test(q)) return null;
  if (!/\d/.test(q)) return null;
  if (!/[+\-*/%^]/.test(q.replace(/^\s*-/, ''))) return null;
  const expr = q.replace(/\^/g, '**');
  try {
    const v = Function('"use strict"; return (' + expr + ')')();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    const text = String(Math.round(v * 1e10) / 1e10);
    return { kind: 'calc', title: text, sub: `${raw.trim()} = ${text}  (Enter to copy)`, value: text };
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
      // Fuzzy matching fallback for apps and files
      if (!s) {
        const fz = fuzzyScore(it.l, q);
        if (fz > 0) s = Math.min(fz, 550);
      }
      if (!s && cq.length >= 2) s = it.c === cq ? 900 : it.c.startsWith(cq) ? 750 : it.c.includes(cq) ? 450 : 0;
      if (!s && it.k >= 2 && q.length >= 2 && fuzzy(it.l, q)) s = 200;
    }
    if (!s) continue;
    const u = settings.usage[it.p];
    s = (it.k === 1 ? s * 0.75 : s) + (it.k === 3 ? 300 : it.k === 2 ? 150 : 0) + (u ? Math.min(u.c, 10) * 20 : 0) - it.l.length * 0.5;
    consider(it, s);
  }
  if (S.commands && !filtered) {
    for (const c of commandList(q)) {
      const titleScore = fuzzyScore(c.title.toLowerCase(), q);
      const kwScore = fuzzyScore(c.kw || '', q);
      const subScore = fuzzyScore(c.sub || '', q);
      const s = Math.max(titleScore, kwScore * 0.8, subScore * 0.6);
      if (s > 0) consider({ cmd: c }, s + 200);
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
const PAD = () => (prefs.spotlightEffect === 'acrylic' ? 0 : 18);
const winWidth = () => prefs.launcherWidth + PAD() * 2;

function createWindow() {
  const acrylic = prefs.spotlightEffect === 'acrylic';
  win = new BrowserWindow({
    width: winWidth(), height: 70 + PAD() * 2, show: false, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    ...(acrylic ? { backgroundMaterial: 'acrylic', roundedCorners: true, thickFrame: false } : { transparent: true, hasShadow: false }),
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
  const h = Math.max(70 + PAD() * 2, launcherHeight);
  win.setContentSize(winWidth(), h);
  win.setPosition(Math.round(d.x + (d.width - winWidth()) / 2), Math.round(d.y + d.height * (prefs.launcherTop / 100) - PAD()));
  win.show();
  win.focus();
  win.webContents.send('shown');
}

function openSettings(page) {
  const target = typeof page === 'string' ? page : null;
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); if (target) settingsWin.webContents.send('goto', target); return; }
  settingsWin = new BrowserWindow({
    width: 900, height: 660, minWidth: 740, minHeight: 520, backgroundMaterial: 'mica',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#000000', height: 38 },
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'), { query: target ? { page: target } : {} });
  settingsWin.webContents.on('did-finish-load', () => {
    try { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('state', state()); } catch (e) { logError(e); }
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- widgets (single desktop window) ----------
let peek = false, flashing = false, flashTimer;
const topMost = () => prefs.widgetMode === 'top' || peek || flashing;
const shouldShow = () => {
  if (prefs.widgetMode === 'peek') return peek || flashing;
  if (prefs.widgetMode === 'top') return true;
  // desktop mode: peek toggles visibility
  return !peek || flashing;
};

function applyVisibility() {
  if (!desktopWin || desktopWin.isDestroyed()) return;
  const show = shouldShow();
  desktopWin.setAlwaysOnTop(topMost() || tourOpen, tourOpen ? 'screen-saver' : undefined);
  clearTimeout(desktopWin.__hide);
  if (show) {
    if (!desktopWin.isVisible()) desktopWin.showInactive();
    desktopWin.webContents.send('vis', true);
    pinWidget();
  } else if (desktopWin.isVisible()) {
    desktopWin.webContents.send('vis', false);
    desktopWin.__hide = setTimeout(() => { if (!desktopWin.isDestroyed() && !shouldShow()) desktopWin.hide(); }, 260);
  }
}

function flash(ms) {
  flashing = true;
  applyVisibility();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashing = false; applyVisibility(); }, ms);
}

function sendShowTour() {
  if (!desktopWin || desktopWin.isDestroyed()) return;
  tourOpen = true;
  revealDesktop(); // tour never paints over a hidden-opacity window
  if (!desktopWin.isVisible()) desktopWin.showInactive();
  desktopWin.setAlwaysOnTop(true, 'screen-saver'); // lift above open windows so the tour is visible
  desktopWin.moveTop();
  desktopWin.webContents.send('show-tour');
}

function revealDesktop() {
  if (desktopWin && !desktopWin.isDestroyed()) desktopWin.setOpacity(1);
}

function createDesktopWindow() {
  const d = screen.getPrimaryDisplay();
  const wa = d.workArea;
  desktopWin = new BrowserWindow({
    x: wa.x, y: wa.y, width: wa.width, height: wa.height,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, hasShadow: false, show: false,
    focusable: true, alwaysOnTop: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  // Stay invisible until first real paint so a transparent window never flashes grey
  desktopWin.setOpacity(0);
  desktopWin.setIgnoreMouseEvents(true, { forward: true });
  desktopWin.setMenu(null);
  desktopWin.webContents.once('did-finish-load', () => {
    if (!desktopWin || desktopWin.isDestroyed()) return;
    try {
      desktopWin.webContents
        .executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
        .catch(() => {})
        .then(() => setTimeout(revealDesktop, 150));
    } catch { revealDesktop(); }
    setTimeout(revealDesktop, 2500); // hard fallback so the desktop can never stay invisible
  });
  desktopWin.loadFile(path.join(__dirname, 'renderer', 'desktop.html'));
  desktopWin.on('blur', pinAll);
  desktopWin.once('ready-to-show', () => {
    desktopWin.__ready = true;
    applyVisibility();
    setTimeout(revealDesktop, 3000); // belt-and-suspenders if did-finish-load never fires
    if (pendingTour || prefs.showTour) { pendingTour = false; setTimeout(sendShowTour, 700); }
  });
  desktopWin.on('closed', () => { desktopWin = null; });
}

function relayoutAll() {
  // Renderer handles relayout via state broadcast
  broadcastState();
}

function setWidgetSize(type, key) {
  if (!WIDGETS[type] || !SIZES[key]) return;
  settings.widgets[type] = { ...settings.widgets[type], size: key };
  saveSettings();
  if (!openWidgets.has(type)) { toggleWidget(type); }
  else broadcastState();
}

function toggleWidget(type) {
  if (!WIDGETS[type]) return;
  if (openWidgets.has(type)) {
    openWidgets.delete(type);
    settings.widgets[type] = { ...settings.widgets[type], open: false };
  } else {
    openWidgets.add(type);
    settings.widgets[type] = { ...settings.widgets[type], open: true };
    flash(4000);
  }
  saveSettings();
  broadcastState();
}

function spawnAllWidgets() {
  for (const t of Object.keys(WIDGETS)) {
    openWidgets.add(t);
    settings.widgets[t] = { ...settings.widgets[t], open: true };
  }
  saveSettings();
  flash(4000);
  broadcastState();
}

function hideAllWidgets() {
  for (const t of Object.keys(WIDGETS)) {
    openWidgets.delete(t);
    settings.widgets[t] = { ...settings.widgets[t], open: false };
  }
  saveSettings();
  broadcastState();
}

// PowerShell helper: pins the desktop window just above the desktop (below every app).
const POLL_SCRIPT = `
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Threading;using System.Runtime.InteropServices;
public static class FG{
[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetClassName(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr FindWindow(string c,string t);
[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern IntPtr FindWindowEx(IntPtr p,IntPtr a,string c,string t);
[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int cx,int cy,uint f);
public delegate bool EnumProc(IntPtr h,IntPtr l);
[DllImport("user32.dll")]public static extern bool EnumWindows(EnumProc p,IntPtr l);
static IntPtr Host(){
 IntPtr pm=FindWindow("Progman",null);
 if(pm!=IntPtr.Zero && FindWindowEx(pm,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero) return pm;
 IntPtr found=IntPtr.Zero;
 EnumWindows(delegate(IntPtr h,IntPtr l){ StringBuilder sb=new StringBuilder(64); GetClassName(h,sb,64); if(sb.ToString()=="WorkerW" && FindWindowEx(h,IntPtr.Zero,"SHELLDLL_DefView",null)!=IntPtr.Zero){found=h;return false;} return true;},IntPtr.Zero);
 return found!=IntPtr.Zero?found:pm;
}
public static void Pin(IntPtr w){
 IntPtr host=Host();
 uint F=0x0001|0x0002|0x0010;
 SetWindowPos(w,new IntPtr(1),0,0,0,0,F);
 if(host!=IntPtr.Zero) SetWindowPos(host,w,0,0,0,0,F);
}
public static void Watch(){
 Thread t=new Thread(delegate(){ string last=""; while(true){ IntPtr h=GetForegroundWindow(); StringBuilder sb=new StringBuilder(256); GetClassName(h,sb,256); uint p; GetWindowThreadProcessId(h,out p); string o=sb.ToString()+"|"+p; if(o!=last){last=o;Console.Out.WriteLine(o);Console.Out.Flush();} Thread.Sleep(250);} });
 t.IsBackground=true; t.Start();
}
}
'@
[FG]::Watch()
while(($line=[Console]::In.ReadLine()) -ne $null){ $p=$line.Split(' '); if($p[0] -eq 'pin'){ try{ [FG]::Pin([IntPtr][long]$p[1]) }catch{} } }`;
let poller = null, pollerOk = false;

function pinWidget() {
  if (!poller || !pollerOk || prefs.widgetMode !== 'desktop' || topMost() || !desktopWin || desktopWin.isDestroyed() || !desktopWin.isVisible()) return;
  try { poller.stdin.write(`pin ${desktopWin.getNativeWindowHandle().readBigUInt64LE(0)}\n`); } catch { /* helper exited */ }
}
let pinTimer;
function pinAll() {
  clearTimeout(pinTimer);
  pinTimer = setTimeout(() => pinWidget(), 40);
}

function ensurePoller() {
  if (prefs.widgetMode !== 'desktop') {
    if (poller) { poller.kill(); poller = null; }
    pollerOk = false;
    applyVisibility();
    broadcastState();
    return;
  }
  if (poller) return;
  poller = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(POLL_SCRIPT, 'utf16le').toString('base64')],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  poller.stdin.on('error', () => {});
  let buf = '';
  poller.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const pid = line.split('|')[1];
      if (pid === undefined) continue;
      if (!pollerOk) { pollerOk = true; applyVisibility(); broadcastState(); }
      else if (Number(pid) !== process.pid) pinAll();
    }
  });
  poller.on('exit', () => { poller = null; pollerOk = false; applyVisibility(); broadcastState(); });
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
      if (desktopWin && !desktopWin.isDestroyed()) desktopWin.webContents.send('clip', clipHistory);
    } catch (e) {
      logError(e);
      if (++failures >= 3) clearInterval(clipTimer);
    }
  }, 700);
}

// ---------- system info ----------
const VIRTUAL_GPU = /microsoft basic display adapter|vnc mirror driver|virtual|remote display|indirect display/i;
const TR_PRO = 'AMD Ryzen Threadripper PRO 5955WX 16-Core (Zen3)';
const EPYC = 'AMD EPYC 9375F 32-Core (Zen5)';
// GFN rigs: match overlay names (RTX 3050 etc) AND physical GPU codenames (L40G/L40S/B40).
// Codenames alone are ambiguous (L40G exists on 3050/3060/4080) — VRAM disambiguates.
const GFN_RIGS = [
  { key: '3050b', match: /RTX 3050|Basic Rig/i, vramGB: [6], rig: 'RTX 3050', tier: 'Free', cpu: TR_PRO, allocation: '5C/5T', memory: '8GB / 14GB', vram: '6GB' },
  { key: '3060d', match: /RTX 3060/i, vramGB: [12], rig: 'RTX 3060', tier: 'Performance', cpu: TR_PRO, allocation: '4C/8T', memory: '28GB', vram: '12GB' },
  { key: '4080h', match: /RTX 4080/i, vramGB: [24], rig: 'RTX 4080', tier: 'Ultimate', cpu: TR_PRO, allocation: '8C/16T', memory: '56GB', vram: '24GB' },
  { key: '5080h', match: /RTX 5080/i, vramGB: [48], rig: 'RTX 5080', tier: 'Ultimate', cpu: EPYC, allocation: '8C/16T', memory: '56GB', vram: '48GB' },
  // Physical GPU codenames reported by Windows/nvidia-smi on GFN — disambiguated by VRAM
  { key: '3050b', match: /L40[GS]?-?6|L40 6/i, vramGB: [6], rig: 'RTX 3050', tier: 'Free', cpu: TR_PRO, allocation: '5C/5T', memory: '8GB / 14GB', vram: '6GB' },
  { key: '3060d', match: /L40[GS]?-?12|L40 12|B40-?12/i, vramGB: [12], rig: 'RTX 3060', tier: 'Performance', cpu: TR_PRO, allocation: '4C/8T', memory: '28GB', vram: '12GB' },
  { key: '3060d', match: /B40/i, vramGB: [12], rig: 'RTX 3060', tier: 'Performance', cpu: EPYC, allocation: '4C/8T', memory: '28GB', vram: '12GB' },
  { key: '4080h', match: /L40[GS]?(?!\d)/i, vramGB: [24], rig: 'RTX 4080', tier: 'Ultimate', cpu: TR_PRO, allocation: '8C/16T', memory: '56GB', vram: '24GB' },
  { key: '5080h', match: /L40[GS]?/i, vramGB: [48], rig: 'RTX 5080', tier: 'Ultimate', cpu: EPYC, allocation: '8C/16T', memory: '56GB', vram: '48GB' },
  { key: '5080h', match: /B40/i, vramGB: [48], rig: 'RTX 5080', tier: 'Ultimate', cpu: EPYC, allocation: '8C/16T', memory: '56GB', vram: '48GB' },
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

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

// Fast, synchronous basics so the specs widget always has something to show.
function getSpecs() {
  let user = 'user';
  try { user = os.userInfo().username; } catch { /* no user info */ }
  const build = os.release().split('.')[2];
  let osName = typeof os.version === 'function' ? os.version() : 'Windows';
  if (parseInt(build, 10) >= 22000) osName = osName.replace('Windows 10', 'Windows 11');
  const cpus = os.cpus();
  const ip = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  const screens = screen.getAllDisplays().map((d) => `${Math.round(d.size.width * d.scaleFactor)}x${Math.round(d.size.height * d.scaleFactor)} @ ${Math.round(d.displayFrequency)}Hz`);
  return {
    host: os.hostname(), user, os: `${osName} (build ${build})`,
    cpu: (cpus[0]?.model || 'Unknown').replace(/\s+/g, ' ').trim(), cores: `${cpus.length} threads`,
    ram: os.totalmem(), ip, screens, uptime: os.uptime(),
  };
}

// nvidia-smi: cleanest GPU name + VRAM. Tries every known install path (SalsaStats-style).
async function smiQuery() {
  const pf = process.env.ProgramW6432 || process.env.ProgramFiles;
  const cands = [process.env.NVIDIA_SMI_PATH, pf && path.join(pf, 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'), 'nvidia-smi.exe'].filter(Boolean);
  for (const exe of [...new Set(cands)]) {
    if (path.isAbsolute(exe) && !fs.existsSync(exe)) continue;
    const out = lines(await runText(exe, ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], 4000))[0];
    if (out) {
      const [n, mib] = out.split(',').map((s) => s.trim());
      const m = Number(mib);
      return { name: n || null, vramGB: m > 0 ? Math.round(m / 1024) : null };
    }
  }
  return {};
}

// Slower hardware detection — all sources gathered in parallel (SalsaStats-style), cached after success.
// Rig/CPU override only applies on GeForce NOW (or manual override) so local PCs show real specs.
let hwPromise;
function getHw() {
  hwPromise ||= (async () => {
    const manualKey = prefs.gfnRig && prefs.gfnRig !== 'auto' ? prefs.gfnRig : null;
    let si = null;
    try { si = require('systeminformation'); } catch { /* systeminformation missing */ }
    // 1) CPU brand (WMI — the registry string os.cpus() reads can be wrong/generic on GFN)
    // 2) GPU controllers  3) nvidia-smi  4) PowerShell/WMIC (+ Electron fallback inside gpuNames)
    const [siCpu, siGfx, smi, wmiNames] = await Promise.all([
      si ? withTimeout(si.cpu(), 20000).catch(() => null) : Promise.resolve(null),
      si ? withTimeout(si.graphics(), 30000).catch(() => null) : Promise.resolve(null),
      smiQuery().catch(() => ({})),
      withTimeout(gpuNames(), 15000).catch(() => []),
    ]);

    // CPU: prefer systeminformation brand (same source SalsaStats uses), fall back to registry
    let cpuLabel = null, physCores = null, totalCores = null;
    if (siCpu) {
      const brand = (siCpu.brand || '').trim();
      const man = (siCpu.manufacturer || '').trim();
      if (brand) cpuLabel = (man && !brand.toLowerCase().startsWith(man.toLowerCase())) ? `${man} ${brand}` : brand;
      physCores = siCpu.physicalCores || null;
      totalCores = siCpu.cores || null;
    }
    if (!cpuLabel) cpuLabel = (os.cpus()[0]?.model || '').replace(/\s+/g, ' ').trim() || null;

    // GPU: pick best physical controller from si.graphics (telemetry + known vendor score, like SalsaStats)
    let siName = null, siVram = null;
    const controllers = (siGfx && Array.isArray(siGfx.controllers)) ? siGfx.controllers : [];
    const physical = controllers.filter((c) => {
      const label = [c.vendor, c.model, c.name].filter((v) => typeof v === 'string').join(' ');
      return label && !VIRTUAL_GPU.test(label);
    });
    if (physical.length) {
      const scored = physical.map((c, i) => {
        const label = `${c.vendor || ''} ${c.model || ''} ${c.name || ''}`;
        const hasT = [c.utilizationGpu, c.temperatureGpu, c.memoryTotal, c.memoryUsed, c.clockCore, c.powerDraw].some(Number.isFinite);
        return { c, i, s: (hasT ? 100 : 0) + (/nvidia|amd|radeon|intel/i.test(label) ? 20 : 0) };
      }).sort((a, b) => b.s - a.s || a.i - b.i);
      const best = scored[0].c;
      siName = best.model || best.name || null;
      if (best.vram) siVram = best.vram >= 1024 ? `${Math.round(best.vram / 1024)}GB` : `${best.vram}MB`;
    }

    // Every non-virtual name found, pooled for rig matching (overlay names + physical codenames)
    const names = [...new Set([smi.name, siName, ...(wmiNames || [])].filter((n) => n && !VIRTUAL_GPU.test(n)))];
    const vramGB = smi.vramGB || (siVram ? parseInt(siVram, 10) : null);

    // GeForce NOW detection: streamer log, physical GFN codenames, or server-class CPU (GFN exposes EPYC/Threadripper)
    let gfn = false;
    try { gfn = fs.statSync(GFN_LOG).size > 0; } catch { /* not a GeForce NOW session */ }
    if (!gfn && names.some((n) => /\bL40[GS]?\b|\bB40\b|\bA10G\b|\bA40\b|\bGRID\b/i.test(n))) gfn = true;
    if (!gfn && /EPYC|Threadripper/i.test(cpuLabel || '')) gfn = true;

    // Rig resolution: manual override wins, otherwise auto only inside GFN sessions
    let rig = null;
    if (manualKey) {
      rig = GFN_RIGS.find((r) => r.key === manualKey) || null;
      gfn = true;
    } else if (gfn) {
      // Name + VRAM exact match first (name-only counts when VRAM is unknown)
      rig = GFN_RIGS.find((r) => names.some((n) => r.match.test(n)) && (!r.vramGB || !vramGB || r.vramGB.includes(vramGB)));
      // VRAM-only fallback only when no consumer RTX name was seen (avoids mislabeling local 4090/5080)
      if (!rig && vramGB && !names.some((n) => /RTX \d{4}/i.test(n))) {
        const byVram = { 6: '3050b', 12: '3060d', 24: '4080h', 48: '5080h' };
        rig = GFN_RIGS.find((r) => r.key === byVram[vramGB]) || null;
      }
    }
    const vram = rig ? rig.vram : (smi.vramGB ? `${smi.vramGB}GB` : null) || siVram;
    // Display name: prefer a vendor-branded source, otherwise fall back to the known rig's GPU
    const displayGpu = names.find((n) => /geforce|rtx|radeon|intel/i.test(n)) || names[0] || (rig ? rig.rig : null);
    return {
      gpu: displayGpu ? [displayGpu] : [], vram, rig, gfn,
      cpu: rig ? rig.cpu : cpuLabel,
      cores: rig ? rig.allocation : (physCores && totalCores ? `${physCores}C/${totalCores}T` : null),
      ramLabel: rig ? rig.memory : null,
    };
  })().catch((e) => { logError(e); hwPromise = null; return { gpu: [], vram: null, rig: null, gfn: false }; })
    .then((r) => { if (!r.gpu.length && (!prefs.gfnRig || prefs.gfnRig === 'auto')) hwPromise = null; return r; });
  return hwPromise;
}

let nvSmi;
function nvidiaPath() {
  if (nvSmi === undefined) {
    const pf = process.env.ProgramW6432 || process.env.ProgramFiles;
    nvSmi = [pf && path.join(pf, 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'), path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe')]
      .find((p) => p && fs.existsSync(p)) || 'nvidia-smi.exe';
  }
  return nvSmi;
}

let gpuCache = { t: 0, d: null };
async function getGpuStats() {
  if (Date.now() - gpuCache.t < 1500) return gpuCache.d;
  const row = lines(await runText(nvidiaPath(), ['--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw,clocks.gr,fan.speed', '--format=csv,noheader,nounits'], 3000))[0];
  let d = null;
  if (row) {
    const [name, util, temp, memUsed, memTotal, power, clock, fan] = row.split(',').map((s) => s.trim());
    const n = (x) => { const v = Number(x); return Number.isFinite(v) ? v : null; };
    d = { name, util: n(util), temp: n(temp), memUsed: n(memUsed), memTotal: n(memTotal), power: n(power), clock: n(clock), fan: n(fan) };
  }
  gpuCache = { t: d ? Date.now() : Date.now() + 58500, d };
  return d;
}

// ---------- media (Windows SMTC — works with YouTube, browsers, Spotify, etc) ----------
const SMTC_GET = `
$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
try {
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
} catch { Write-Output '{}'; exit }
$global:__asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
function AwaitOp($op, $type) {
  try { $t = $global:__asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(4000); if ($t.IsFaulted) { return $null }; return $t.Result } catch { return $null }
}
$mgr = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $mgr) { Write-Output '{}'; exit }
$ses = $mgr.GetCurrentSession()
if (-not $ses) { Write-Output '{}'; exit }
$props = AwaitOp ($ses.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$pb = $ses.GetPlaybackInfo()
$o = @{ app = "$($ses.SourceAppUserModelId)"; status = "$($pb.PlaybackStatus)"; canPlay = [bool]$pb.IsPlayEnabled; canPause = [bool]$pb.IsPauseEnabled; canNext = [bool]$pb.IsNextEnabled; canPrev = [bool]$pb.IsPreviousEnabled }
if ($props) { $o.title = "$($props.Title)"; $o.artist = "$($props.Artist)"; $o.album = "$($props.AlbumTitle)" }
Write-Output ($o | ConvertTo-Json -Compress)
`;
const SMTC_CTRL = (action) => `
$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
try { $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] } catch { exit }
$global:__asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' } | Select-Object -First 20
$opM = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
function AwaitOp($op, $type) { try { $t = $opM.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(3000); return $t.Result } catch { return $null } }
$actM = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
function AwaitAct($a) { try { $t = $actM.Invoke($null, @($a)); [void]$t.Wait(3000) } catch { } }
$mgr = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $mgr) { exit }
$ses = $mgr.GetCurrentSession()
if (-not $ses) { exit }
switch ('${action}') {
  'play' { AwaitAct $ses.TryPlayAsync() }
  'pause' { AwaitAct $ses.TryPauseAsync() }
  'toggle' { if ($ses.GetPlaybackInfo().PlaybackStatus -eq 'Playing') { AwaitAct $ses.TryPauseAsync() } else { AwaitAct $ses.TryPlayAsync() } }
  'next' { AwaitAct $ses.TrySkipNextAsync() }
  'prev' { AwaitAct $ses.TrySkipPreviousAsync() }
}
`;
let mediaCache = { t: 0, d: null };
async function getMediaInfo() {
  if (Date.now() - mediaCache.t < 1500) return mediaCache.d;
  const out = (await runText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SMTC_GET], 5000)).trim();
  let d = null;
  if (out && out !== '{}') {
    try { d = JSON.parse(out); } catch { d = null; }
  }
  mediaCache = { t: Date.now(), d: d || null };
  return mediaCache.d;
}
async function mediaControl(action) {
  if (!['play', 'pause', 'toggle', 'next', 'prev'].includes(action)) return;
  await runText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SMTC_CTRL(action)], 5000);
  mediaCache = { t: 0, d: null };
}

let lastCpu = null;
const cpuTimes = () => {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; }
  return { idle, total };
};

const weatherCache = {};
async function getWeather(city, units) {
  const normCity = String(city || '').trim();
  const isAuto = !normCity || /^(auto|current|local|my location)$/i.test(normCity);
  const key = `${normCity || 'auto'}|${units}`;
  const hit = weatherCache[key];
  if (hit && Date.now() - hit.t < 15 * 60 * 1000) return hit.d;
  try {
    let loc = null;
    if (isAuto) {
      try {
        const geo = await (await net.fetch('http://ip-api.com/json/')).json();
        if (geo && geo.lat && geo.lon) {
          loc = { name: geo.city || 'Local Area', country_code: geo.countryCode || '', latitude: geo.lat, longitude: geo.lon };
        }
      } catch { /* try fallback */ }
      if (!loc) {
        try {
          const geo = await (await net.fetch('https://freeipapi.com/api/json')).json();
          if (geo && geo.latitude && geo.longitude) {
            loc = { name: geo.cityName || 'Local Area', country_code: geo.countryCode || '', latitude: geo.latitude, longitude: geo.longitude };
          }
        } catch { /* fallback to search */ }
      }
    }
    if (!loc) {
      const searchTarget = isAuto ? 'London' : normCity;
      const g = await (await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchTarget)}&count=1`)).json();
      loc = g.results?.[0];
    }
    if (!loc) return { error: `Could not find city "${normCity}"` };
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
async function takeScreenshot() {
  try {
    const { desktopCapturer } = require('electron');
    const primary = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: primary.size.width, height: primary.size.height } });
    const src = sources[0];
    if (!src) return;
    const img = src.thumbnail.toPNG();
    const dir = path.join(app.getPath('pictures'), 'SalsaSpotlight');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `screenshot-${Date.now()}.png`);
    fs.writeFileSync(file, img);
    new Notification({ title: 'Screenshot saved', body: file }).show();
    shell.showItemInFolder(file);
  } catch (e) { logError(e); }
}
function runCommand(id) {
  switch (id) {
    case 'winsettings': shell.openExternal('ms-settings:'); break;
    case 'prefs': openSettings(); break;
    case 'taskmgr': spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore' }).unref(); break;
    case 'lock': spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { detached: true, stdio: 'ignore' }).unref(); break;
    case 'peek': peek = !peek; applyVisibility(); break;
    case 'reindex': startIndex(); break;
    case 'update': openSettings('updates'); checkUpdates(true); break;
    case 'quit': app.quit(); break;
    case 'spawn': spawnAllWidgets(); break;
    case 'hideall': hideAllWidgets(); break;
    case 'screenshot': takeScreenshot(); break;
    case 'resetlayout': prefs.widgetLayout = {}; saveSettings(); broadcastState(); if (desktopWin && !desktopWin.isDestroyed()) desktopWin.webContents.send('arrange'); break;
    default:
      if (id.startsWith('size-')) { const [, t, k] = id.split('-'); setWidgetSize(t, k); }
      else if (id.startsWith('w-')) toggleWidget(id.slice(2));
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

let launcherHeight = 70;
ipcMain.on('resize', (_e, h, w) => {
  launcherHeight = Math.max(70 + PAD() * 2, Math.min(Number(h) || 70, 860));
  if (win && win.isVisible()) {
    const width = Math.min(Math.max(winWidth(), Math.round(Number(w) || 0)), 1400);
    win.setContentSize(width, launcherHeight);
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    win.setPosition(Math.round(d.x + (d.width - width) / 2), win.getPosition()[1]);
  }
});
ipcMain.on('hide', () => win.hide());
ipcMain.on('close-widget', (_e, type) => toggleWidget(String(type)));
ipcMain.on('set-click-through', (_e, ignore) => {
  if (desktopWin && !desktopWin.isDestroyed()) desktopWin.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.handle('state', () => {
  try {
    return state();
  } catch (e) {
    logError(e);
    // Return a minimal safe state so settings can still load
    return {
      update: { status: 'idle', version: app.getVersion(), packaged: app.isPackaged },
      sizes: {},
      prefs: structuredClone(DEFAULTS),
      open: {},
      widgets: {},
      poller: false,
      widgetLayout: {},
    };
  }
});
ipcMain.handle('startup:get', () => ({ ...startupBatch.getStartupStatus(), packaged: app.isPackaged }));
ipcMain.handle('startup:set', (_e, enabled) => startupBatch.setStartupEnabled(enabled === true, process.execPath));
ipcMain.on('set', (_e, key, val) => setPref(String(key), val));
ipcMain.on('toggle-widget', (_e, t) => toggleWidget(String(t)));
ipcMain.on('open-settings', openSettings);
ipcMain.on('check-updates', () => checkUpdates(true));
ipcMain.on('install-update', installUpdate);
ipcMain.on('reset', () => {
  const keep = prefs.launchAtLogin;
  prefs = structuredClone(DEFAULTS);
  prefs.launchAtLogin = keep;
  saveSettings();
  nativeTheme.themeSource = prefs.theme;
  registerKeys(); ensurePoller(); clipTimerSet();
  if (win && !win.isDestroyed()) { const old = win; createWindow(); old.destroy(); }
  relayoutAll();
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
ipcMain.handle('specs-gpu', () => getHw());
ipcMain.handle('gpu-stats', () => getGpuStats());
ipcMain.handle('media-info', () => getMediaInfo());
ipcMain.on('media-control', (_e, a) => mediaControl(String(a)));
ipcMain.handle('net', async () => {
  try {
    const r = await withTimeout(require('systeminformation').networkStats(), 3000);
    const x = r.find((i) => i.operstate === 'up') || r[0];
    return x ? { down: Math.max(0, x.rx_sec || 0), up: Math.max(0, x.tx_sec || 0), iface: x.iface } : null;
  } catch { return null; }
});
ipcMain.on('drag-start', () => { /* gridstack handles drag internally */ });
ipcMain.on('drag-end', () => { /* gridstack handles drop internally */ });
ipcMain.on('arrange', () => { /* renderer handles arrange */ broadcastState(); });
ipcMain.on('show-tour', sendShowTour);
ipcMain.on('tour-closed', () => {
  if (!desktopWin || desktopWin.isDestroyed()) return;
  tourOpen = false;
  applyVisibility(); // restores the normal topMost() state
});
ipcMain.on('set-size', (_e, t, k) => setWidgetSize(String(t), String(k)));
ipcMain.on('widget-menu', (_e, type) => {
  const t = String(type);
  if (!WIDGETS[t] || !desktopWin || desktopWin.isDestroyed()) return;
  const cur = settings.widgets[t]?.size || 'm';
  Menu.buildFromTemplate([
    { label: WIDGETS[t].title, enabled: false },
    { type: 'separator' },
    { label: 'Size', submenu: Object.entries(SIZE_LABELS).map(([k, l]) => ({ label: l, type: 'radio', checked: cur === k, click: () => setWidgetSize(t, k) })) },
    { label: 'Auto-arrange widgets', click: () => desktopWin.webContents.send('arrange') },
    { label: 'Show all widgets', click: spawnAllWidgets },
    { label: 'Hide all widgets', click: hideAllWidgets },
    { label: 'Widget settings...', click: openSettings },
    { type: 'separator' },
    { label: 'Close widget', click: () => toggleWidget(t) },
  ]).popup({ window: desktopWin });
});
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
ipcMain.handle('top-apps', () => {
  const pinned = (settings.pinnedApps || []).map((p) => {
    const u = settings.usage[p];
    return u ? { p, n: u.n, pinned: true } : null;
  }).filter(Boolean);
  const recent = Object.entries(settings.usage)
    .filter(([p, u]) => u.k >= 2 && !(settings.pinnedApps || []).includes(p))
    .sort((a, b) => b[1].c - a[1].c).slice(0, 16).map(([p, u]) => ({ p, n: u.n }));
  return [...pinned, ...recent];
});
ipcMain.on('pin-app', (_e, p) => {
  const path = String(p);
  if (!settings.pinnedApps) settings.pinnedApps = [];
  const idx = settings.pinnedApps.indexOf(path);
  if (idx >= 0) settings.pinnedApps.splice(idx, 1); else settings.pinnedApps.push(path);
  saveSettings();
  if (desktopWin && !desktopWin.isDestroyed()) desktopWin.webContents.send('state', state());
});
ipcMain.on('open-path', (_e, p) => { if (settings.usage[p]) shell.openPath(p); });

// Details panel (Windhawk-style) — everything runs as the current user, no admin required.
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
ipcMain.handle('file-info', async (_e, p) => {
  try {
    const fp = String(p);
    const st = fs.statSync(fp);
    const info = {
      name: path.basename(fp),
      dir: path.dirname(fp),
      isDir: st.isDirectory(),
      size: st.isDirectory() ? null : st.size,
      mtime: st.mtimeMs,
      target: null,
    };
    if (/\.lnk$/i.test(fp)) {
      const out = await runText('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `(New-Object -ComObject WScript.Shell).CreateShortcut(${psq(fp)}).TargetPath`], 3000);
      info.target = lines(out)[0] || null;
    }
    return info;
  } catch { return null; }
});
ipcMain.on('copy-path', (_e, s) => clipboard.writeText(String(s)));
ipcMain.on('show-props', (_e, p) => {
  try {
    if (win && win.isVisible()) win.hide();
    const fp = String(p);
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$s=New-Object -ComObject Shell.Application;$f=$s.Namespace(${psq(path.dirname(fp))});$i=$f.ParseName(${psq(path.basename(fp))});if($i){$i.InvokeVerb('properties')}`],
      { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
  } catch (e) { logError(e); }
});
ipcMain.on('forget', (_e, p) => {
  if (settings.usage[String(p)]) {
    delete settings.usage[String(p)];
    saveSettings();
    broadcastState();
  }
});
ipcMain.on('reindex', () => { startIndex(); });
ipcMain.handle('clip-get', () => clipHistory);
ipcMain.on('clip-copy', (_e, i) => { if (clipHistory[i]) clipboard.writeText(clipHistory[i]); });
ipcMain.on('clip-clear', () => {
  clipHistory = [];
  if (desktopWin && !desktopWin.isDestroyed()) desktopWin.webContents.send('clip', clipHistory);
});

ipcMain.handle('logs:read', () => {
  const file = path.join(app.getPath('userData'), 'error.log');
  try {
    return { path: file, content: fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'No errors logged. All systems running normally.' };
  } catch (e) {
    return { path: file, content: `Error reading log file: ${e.message}` };
  }
});
ipcMain.on('logs:clear', () => {
  const file = path.join(app.getPath('userData'), 'error.log');
  try { fs.writeFileSync(file, ''); } catch { /* ignore */ }
});
ipcMain.on('logs:open-folder', () => {
  shell.showItemInFolder(path.join(app.getPath('userData'), 'error.log'));
});

// ---------- auto-update (GitHub releases) ----------
let manualCheck = false, updateCheckTimer = null;
const notify = (title, body) => new Notification({ title, body }).show();
const setUpdate = (patch) => { try { Object.assign(updateInfo, patch); broadcastState(); } catch { /* never let update UI break the app */ } };
const errText = (e) => String(e?.message || e).split('\n')[0];
const safeUpdateEvent = (fn) => (...args) => { try { fn(...args); } catch (e) { logError(e); } };

function checkUpdates(manual) {
  manualCheck = manual;
  if (!app.isPackaged) { setUpdate({ status: 'dev' }); return; }
  if (updateReady) { setUpdate({ status: 'ready', latest: updateReady }); return; }
  setUpdate({ status: 'checking', error: '', percent: 0 });
  clearTimeout(updateCheckTimer);
  // Timeout: if checkForUpdates hangs (slow/blocked network on GFN), give up after 30s
  updateCheckTimer = setTimeout(() => {
    if (updateInfo.status === 'checking') setUpdate({ status: 'error', error: 'Update check timed out' });
  }, 30000);
  autoUpdater.checkForUpdates().catch((e) => {
    clearTimeout(updateCheckTimer);
    logError(e);
    setUpdate({ status: 'error', error: errText(e) });
  });
}

function installUpdate() {
  if (!updateReady) return;
  quitting = true;
  autoUpdater.quitAndInstall(false, true);
}

function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', safeUpdateEvent((e) => { logError(e); clearTimeout(updateCheckTimer); setUpdate({ status: 'error', error: errText(e) }); }));
  autoUpdater.on('update-not-available', safeUpdateEvent(() => { clearTimeout(updateCheckTimer); setUpdate({ status: 'uptodate', checkedAt: Date.now() }); }));
  autoUpdater.on('update-available', safeUpdateEvent((info) => setUpdate({ status: 'downloading', latest: info.version, percent: 0 })));
  autoUpdater.on('download-progress', safeUpdateEvent((p) => setUpdate({ status: 'downloading', percent: Math.round(p.percent) })));
  autoUpdater.on('update-downloaded', safeUpdateEvent((info) => {
    clearTimeout(updateCheckTimer);
    updateReady = info.version;
    setUpdate({ status: 'ready', latest: info.version, percent: 100 });
    if (!manualCheck) notify('Update ready', `SalsaSpotlight ${info.version} installs when you quit. Open Settings > Updates to restart now.`);
  }));
  // Delay the first check so the app is fully stable before touching the network
  setTimeout(() => checkUpdates(false), 20000);
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
    { label: 'Widgets', submenu: [...Object.keys(WIDGETS).map((t) => ({ label: WIDGETS[t].title, type: 'checkbox', checked: openWidgets.has(t), click: () => toggleWidget(t) })), { type: 'separator' }, { label: 'Show all widgets', click: spawnAllWidgets }, { label: 'Hide all widgets', click: hideAllWidgets }] },
    { type: 'separator' },
    { label: 'Launch at login', type: 'checkbox', checked: prefs.launchAtLogin, click: (i) => setPref('launchAtLogin', i.checked) },
    { label: 'Rebuild index', click: startIndex },
    { label: 'Check for updates', click: () => { openSettings('updates'); checkUpdates(true); } },
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
  pendingTour = firstRun;
  loadSettings();
  nativeTheme.themeSource = prefs.theme;
  createWindow();
  createDesktopWindow();
  createTray();
  screen.on('display-metrics-changed', relayoutAll);
  screen.on('display-removed', relayoutAll);
  scheduleStartupStableClear();
  const hotkeyOk = registerKeys();
  if (firstRun || !hotkeyOk) {
    new Notification({
      title: 'SalsaSpotlight is running',
      body: hotkeyOk ? `Press ${prefs.hotkey.replace('+', ' + ')} to search. Find it in the system tray too.`
        : `${prefs.hotkey} is taken by another app, so use Ctrl + Space instead. Change it in Settings.`,
    }).show();
  }
  startIndex();
  setupUpdates();
  armIndexTimer();
  clipTimerSet();
  ensurePoller();
  // Restore open widgets
  for (const t of Object.keys(WIDGETS)) if (settings.widgets[t]?.open) openWidgets.add(t);
  broadcastState();
  // Heal after session start: re-assert visibility, state and bottom-pin once things settle
  [4000, 12000].forEach((ms) => setTimeout(() => {
    if (quitting) return;
    applyVisibility();
    broadcastState();
    pinWidget();
  }, ms));
});

app.on('before-quit', () => { quitting = true; });
app.on('second-instance', () => { if (win && !win.isVisible()) toggle(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); poller?.kill(); });
app.on('window-all-closed', (e) => e.preventDefault());
